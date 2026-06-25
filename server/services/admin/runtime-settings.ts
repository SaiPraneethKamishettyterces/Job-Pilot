// Admin-editable runtime settings (spec Pt 18): a DB overlay on top of env config
// so the owner can change spend caps, the global-run schedule, and the 50/50 split
// LIVE without a redeploy. Env values are the defaults; AdminSetting rows override
// them. Cached briefly so hot paths (spend guard, scheduler tick) stay cheap.
import { prisma } from "../../lib/db.js";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

export type RuntimeSettings = {
  apifySpendHardUsdPerDay: number;
  apifySpendSoftUsdPerDay: number;
  apifySplitPercent: number; // paid-plan Apify share of the shortlist
  globalRunMode: "manual" | "auto";
  globalRunHour: number; // 0–23
  timezone: string;
  weekendIngest: boolean;
  purgeWeekday: number; // 0=Sun … 6=Sat
};

// key → { parse, validate } for each editable setting.
type Key = keyof RuntimeSettings;

function defaults(): RuntimeSettings {
  const s = config.automation.scheduler;
  return {
    apifySpendHardUsdPerDay: config.apify.spendHardUsdPerDay,
    apifySpendSoftUsdPerDay: config.apify.spendSoftUsdPerDay,
    apifySplitPercent: config.matching.apifySplitPercent,
    globalRunMode: s.globalRunMode,
    globalRunHour: s.runHour,
    timezone: s.timezone,
    weekendIngest: s.weekendIngest,
    purgeWeekday: s.purgeWeekday,
  };
}

let cache: { at: number; value: RuntimeSettings } | null = null;
const TTL_MS = 30_000;

/** Effective settings: env defaults overlaid with admin overrides (cached 30s). */
export async function getRuntimeSettings(): Promise<RuntimeSettings> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const base = defaults();
  try {
    const rows = await prisma.adminSetting.findMany();
    for (const r of rows) {
      if (!(r.key in base)) continue;
      try {
        (base as Record<string, unknown>)[r.key] = JSON.parse(r.value);
      } catch {
        /* ignore a malformed row — keep the default */
      }
    }
  } catch (err) {
    logger.warn({ err: String(err) }, "runtime-settings: DB read failed, using env defaults");
  }
  cache = { at: Date.now(), value: base };
  return base;
}

const VALIDATORS: Record<Key, (v: unknown) => unknown> = {
  apifySpendHardUsdPerDay: (v) => clampNum(v, 0, 1000),
  apifySpendSoftUsdPerDay: (v) => clampNum(v, 0, 1000),
  apifySplitPercent: (v) => clampNum(v, 0, 100),
  globalRunMode: (v) => (v === "auto" ? "auto" : "manual"),
  globalRunHour: (v) => Math.round(clampNum(v, 0, 23)),
  timezone: (v) => (typeof v === "string" && v.trim() ? v.trim() : "UTC"),
  weekendIngest: (v) => Boolean(v),
  purgeWeekday: (v) => Math.round(clampNum(v, 0, 6)),
};

function clampNum(v: unknown, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

/** Persist a partial set of overrides (admin UI). Unknown keys are ignored. */
export async function setRuntimeSettings(patch: Partial<Record<Key, unknown>>): Promise<RuntimeSettings> {
  for (const [key, raw] of Object.entries(patch)) {
    const validate = VALIDATORS[key as Key];
    if (!validate) continue;
    const value = JSON.stringify(validate(raw));
    await prisma.adminSetting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  cache = null; // invalidate so the next read reflects the change immediately
  return getRuntimeSettings();
}
