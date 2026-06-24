// Company registry, backed by the JobSource table. This is what makes coverage
// WIDE: instead of a hardcoded ~23-company map, the global ingestor reads thousands
// of {ats, token} boards from the DB (seeded from a public list, auto-grown from
// user targets, re-synced periodically).
//
// Storage convention on JobSource: name = `${ats}:${token}` (unique), platform =
// ats, configJson = { token, host?, tenant?, site? } (Workday needs the extras).
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import type { AtsType, BoardRef } from "./ats-sources.js";

const ATS_PLATFORMS = new Set<string>([
  "greenhouse", "lever", "ashby", "workable", "recruitee", "personio", "smartrecruiters", "workday",
  "breezy", "teamtailor",
]);

export type RegistryEntry = {
  ats: AtsType;
  token: string;
  host?: string;
  tenant?: string;
  site?: string;
  company?: string;
};

function refKey(ats: string, token: string): string {
  return `${ats}:${token}`;
}

function rowToBoard(platform: string, configJson: unknown): BoardRef | null {
  if (!ATS_PLATFORMS.has(platform)) return null;
  const cfg = (configJson ?? {}) as Record<string, unknown>;
  const token = typeof cfg["token"] === "string" ? (cfg["token"] as string) : "";
  if (!token) return null;
  return {
    ats: platform as AtsType,
    token,
    host: typeof cfg["host"] === "string" ? (cfg["host"] as string) : undefined,
    tenant: typeof cfg["tenant"] === "string" ? (cfg["tenant"] as string) : undefined,
    site: typeof cfg["site"] === "string" ? (cfg["site"] as string) : undefined,
  };
}

/**
 * Active ATS boards from the registry, least-recently-checked first (never-checked
 * rank first via nulls), so a bounded crawl naturally rotates across the whole
 * registry over successive runs. Pass `limit` to cap how many are returned.
 */
export async function loadRegistryBoards(limit?: number): Promise<BoardRef[]> {
  const rows = await prisma.jobSource.findMany({
    where: { isActive: true, platform: { in: [...ATS_PLATFORMS] } },
    select: { platform: true, configJson: true },
    orderBy: [{ lastCheckedAt: { sort: "asc", nulls: "first" } }],
    ...(limit && limit > 0 ? { take: limit } : {}),
  });
  return rows.map((r) => rowToBoard(r.platform, r.configJson)).filter((b): b is BoardRef => b !== null);
}

/**
 * Record the result of fetching a board: stamp lastCheckedAt, update job count, and
 * either mark success or auto-deactivate a board that has now missed twice without
 * ever succeeding (keeps the crawl focused on live boards).
 */
export async function recordBoardHealth(ats: string, token: string, jobCount: number): Promise<void> {
  const name = refKey(ats, token);
  const existing = await prisma.jobSource.findUnique({
    where: { name },
    select: { lastCheckedAt: true, lastSuccessAt: true },
  });
  if (!existing) return; // not a registry board (e.g. hardcoded fallback) — skip
  const now = new Date();
  if (jobCount > 0) {
    await prisma.jobSource.update({
      where: { name },
      data: { lastCheckedAt: now, lastSuccessAt: now, activeJobCount: jobCount, isActive: true },
    });
  } else {
    // Second consecutive miss with no prior success → deactivate as dead.
    const deactivate = existing.lastCheckedAt !== null && existing.lastSuccessAt === null;
    await prisma.jobSource.update({
      where: { name },
      data: { lastCheckedAt: now, activeJobCount: 0, ...(deactivate ? { isActive: false } : {}) },
    });
  }
}

/**
 * Fast bulk insert for large imports (tens of thousands). Uses createMany +
 * skipDuplicates (one query per chunk) — inserts new boards, leaves existing ones
 * untouched. Use persistBoards when you need to UPDATE existing config.
 */
export async function bulkInsertBoards(entries: RegistryEntry[]): Promise<number> {
  const seen = new Set<string>();
  const rows = [];
  for (const e of entries) {
    if (!e.token) continue;
    const name = refKey(e.ats, e.token);
    if (seen.has(name)) continue;
    seen.add(name);
    rows.push({
      name,
      platform: e.ats,
      isActive: true,
      configJson: {
        token: e.token,
        ...(e.host ? { host: e.host } : {}),
        ...(e.tenant ? { tenant: e.tenant } : {}),
        ...(e.site ? { site: e.site } : {}),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any,
    });
  }
  let inserted = 0;
  const CHUNK = 1000;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const res = await prisma.jobSource.createMany({ data: rows.slice(i, i + CHUNK), skipDuplicates: true });
    inserted += res.count;
  }
  return inserted;
}

/** Upsert boards into the registry (idempotent). Used by auto-grow + seed + resync. */
export async function persistBoards(entries: RegistryEntry[]): Promise<number> {
  let written = 0;
  for (const e of entries) {
    if (!e.token) continue;
    const name = refKey(e.ats, e.token);
    const configJson = {
      token: e.token,
      ...(e.host ? { host: e.host } : {}),
      ...(e.tenant ? { tenant: e.tenant } : {}),
      ...(e.site ? { site: e.site } : {}),
    };
    try {
      await prisma.jobSource.upsert({
        where: { name },
        create: { name, platform: e.ats, isActive: true, configJson },
        update: { configJson },
      });
      written++;
    } catch (err) {
      logger.warn({ name, err: String(err) }, "Registry upsert failed");
    }
  }
  return written;
}
