// Global ingestor — the scheduled, USER-AGNOSTIC job-pool fetch.
//
// Replaces the old per-user runIngestion fetch. Runs once/day (independent of any
// user): pulls the union of all known ATS boards + free aggregator APIs, normalizes
// each posting, upserts it into the shared JobPosting pool keyed by a global
// dedupeKey, then embeds the new/changed rows. Per-user role/location/blocked
// filtering is NOT done here — that belongs to per-user candidate generation.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { fetchBoard, globalBoardRegistry, resolveBoards, type RawJob, type BoardRef } from "./ats-sources.js";
import { fetchAggregatorSources } from "./sources/index.js";
import { buildDemandProfile } from "./demand-profile.js";
import { loadRegistryBoards, persistBoards, recordBoardHealth } from "./registry.js";
import { normalizeJob } from "./job-normalizer.js";
import { upsertPosting, expireStalePostings } from "../../repositories/job-posting-repository.js";
import { embedPendingPostings } from "./embed-postings.js";
import { runApifyIngestion } from "./apify-ingestor.js";

const BOARD_CONCURRENCY = 10;
const WORKER_NAME = "global-ingestor";

/** Dedupe board refs by `${ats}:${token}` (registry + demand-resolved may overlap). */
function dedupeBoards(boards: BoardRef[]): BoardRef[] {
  const seen = new Set<string>();
  const out: BoardRef[] = [];
  for (const b of boards) {
    const key = `${b.ats}:${b.token}`;
    if (b.token && !seen.has(key)) {
      seen.add(key);
      out.push(b);
    }
  }
  return out;
}

/**
 * Fetch ATS boards with bounded concurrency (the registry may be large), recording
 * per-board health so the registry self-verifies (rotation + auto-deactivation).
 */
async function fetchBoards(boards: BoardRef[]): Promise<RawJob[]> {
  const jobs: RawJob[] = [];
  for (let i = 0; i < boards.length; i += BOARD_CONCURRENCY) {
    const chunk = boards.slice(i, i + BOARD_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((b) => fetchBoard(b)));
    await Promise.all(
      results.map((r, j) => {
        const board = chunk[j]!;
        const count = r.status === "fulfilled" ? r.value.length : 0;
        if (r.status === "fulfilled") jobs.push(...r.value);
        return recordBoardHealth(board.ats, board.token, count).catch(() => {});
      }),
    );
  }
  return jobs;
}

/**
 * Run one global ingestion cycle end-to-end. Records a GlobalIngestRun row with
 * metrics and never throws — failures are recorded as status=FAILED.
 */
export async function runGlobalIngestion(): Promise<string> {
  const run = await prisma.globalIngestRun.create({
    data: { status: "FETCHING", startedAt: new Date() },
  });

  try {
    // Aggregate active-subscriber demand: target roles steer the search APIs;
    // target companies expand the ATS board set beyond the registry.
    const demand = await buildDemandProfile();
    // Demand-resolved + hardcoded-fallback boards are ALWAYS crawled; the rest of
    // the (potentially huge) registry fills the remaining per-run budget, rotated
    // least-recently-checked-first so the whole registry is covered over time.
    const demandBoards = resolveBoards(demand.companies);
    const fallback = globalBoardRegistry();
    const cap = config.registry.maxBoardsPerRun;
    const reserved = demandBoards.length + fallback.length;
    let registryBoards: BoardRef[];
    if (cap <= 0) registryBoards = await loadRegistryBoards(); // unlimited
    else {
      const regLimit = Math.max(0, cap - reserved);
      registryBoards = regLimit > 0 ? await loadRegistryBoards(regLimit) : [];
    }
    const boards = dedupeBoards([...demandBoards, ...fallback, ...registryBoards]);
    // Auto-grow: persist demand-resolved boards so the registry compounds with use.
    if (demandBoards.length) {
      await persistBoards(demandBoards.map((b) => ({ ats: b.ats, token: b.token, host: b.host, tenant: b.tenant, site: b.site }))).catch(() => {});
    }
    logger.info(
      { runId: run.id, boards: boards.length, registryUsed: registryBoards.length, cap,
        keywords: demand.roleKeywords.length, companies: demand.companies.length },
      "Global ingestion: fetching sources (demand-driven, bounded DB registry)",
    );

    const [atsJobs, aggregator] = await Promise.all([fetchBoards(boards), fetchAggregatorSources(demand)]);
    const rawJobs = [...atsJobs, ...aggregator.jobs];

    await prisma.globalIngestRun.update({
      where: { id: run.id },
      data: {
        boardsFetched: boards.length + aggregator.sourcesUsed,
        postingsDiscovered: rawJobs.length,
        keywordsUsed: demand.roleKeywords.length,
      },
    });

    // Normalize + upsert into the pool, deduped globally on dedupeKey.
    let inserted = 0;
    let updated = 0;
    const seen = new Set<string>();
    for (const raw of rawJobs) {
      const norm = normalizeJob(raw);
      if (seen.has(norm.dedupeKey)) continue; // collapse intra-cycle duplicates
      seen.add(norm.dedupeKey);
      try {
        const res = await upsertPosting(norm);
        if (res.isNew) inserted++;
        else updated++;
      } catch (err) {
        logger.warn({ runId: run.id, dedupeKey: norm.dedupeKey, err: String(err) }, "Posting upsert failed");
      }
    }

    await prisma.globalIngestRun.update({
      where: { id: run.id },
      data: { status: "EMBEDDING", postingsInserted: inserted, postingsUpdated: updated },
    });

    const embedded = await embedPendingPostings();

    // Retention: soft-expire postings not re-seen within the retention window so
    // matching surfaces only fresh, still-live jobs (re-seen ones re-activate).
    const expired = await expireStalePostings(config.ingest.poolRetentionDays).catch(() => 0);
    if (expired) logger.info({ runId: run.id, expired }, "Global ingestion: expired stale postings");

    await prisma.globalIngestRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", postingsEmbedded: embedded, completedAt: new Date() },
    });

    logger.info(
      { runId: run.id, discovered: rawJobs.length, inserted, updated, embedded },
      "Global ingestion completed",
    );

    // Separate paid track: run the enabled Apify scrapers (gated by config + token),
    // reusing the same demand profile. Fail-soft — never affects the free run status.
    await runApifyIngestion(demand).catch((err) =>
      logger.error({ err: String(err) }, "Apify ingestion failed (non-fatal)"),
    );

    return run.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ runId: run.id, err: msg, worker: WORKER_NAME }, "Global ingestion failed");
    await prisma.globalIngestRun
      .update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: msg, completedAt: new Date() } })
      .catch(() => {});
    return run.id;
  }
}

/** Fire-and-forget trigger for the scheduler. */
export function triggerGlobalIngestion(): void {
  void runGlobalIngestion().catch((err) => {
    logger.error({ err: String(err), worker: WORKER_NAME }, "Unhandled global ingestion error");
  });
}
