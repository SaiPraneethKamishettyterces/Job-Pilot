import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { prisma } from "../lib/db.js";
import { tzParts } from "../lib/clock.js";
import { createIngestionRun } from "../services/ingestion/ingestion-orchestrator.js";
import { runGlobalIngestion } from "../services/ingestion/global-ingestor.js";
import { syncRegistry } from "../services/ingestion/registry-sync.js";
import { purgeStalePostings, purgeStaleJobSeen, purgeStaleUserJobSeen } from "../repositories/job-posting-repository.js";
import { rebalanceApifyBudgets } from "../services/ingestion/source-budget.js";
import { snapshotStorage } from "../services/admin/storage-metrics.js";
import { getRuntimeSettings } from "../services/admin/runtime-settings.js";
import { triggerFullPipeline } from "./application-pipeline.js";
import { remainingApplications } from "../services/billing/usage-limits.js";

// In-process scheduler. GLOBAL ingestion (shared pool) is decoupled from per-user
// runs:
//  - Global ingestion runs in MANUAL mode (default; admin button only) or AUTO mode
//    (≤ once/24h at the configured hour+timezone, default overnight). Weekends pause
//    new postings (handled inside runGlobalIngestion). A weekly hard purge keeps the
//    pool to a rolling week of unreferenced postings.
//  - Per-user runs are USER-INITIATED from the dashboard; the legacy daily
//    auto-dispatch is kept but OFF by default.
// Single-instance design; the durable multi-instance path is an external scheduler.

let timer: NodeJS.Timeout | null = null;
let lastDispatchDate: string | null = null;
let lastIngestDate: string | null = null;
let lastPurgeDate: string | null = null;
let lastRebalanceDate: string | null = null;
let lastStorageDate: string | null = null;

function sched() {
  return config.automation.scheduler;
}

/**
 * AUTO-mode global pool refresh: at most once per day at/after `runHour` in the
 * configured timezone. No-op in manual mode (admin triggers via runGlobalIngestionNow).
 * Exported for tests. Awaited so a same-tick dispatch sees the fresh pool.
 */
export async function maybeRunGlobalIngestion(): Promise<boolean> {
  const rt = await getRuntimeSettings();
  if (rt.globalRunMode !== "auto") return false;
  const { hour, dateKey } = tzParts(rt.timezone);
  if (hour < rt.globalRunHour) return false;
  if (lastIngestDate === dateKey) return false;
  lastIngestDate = dateKey;
  return runGlobalIngestionNow();
}

/**
 * Run one global ingestion cycle now (manual admin trigger OR the auto path).
 * Syncs the registry first (fail-soft), then ingests. Respects the weekend pause
 * inside runGlobalIngestion. Returns true on success.
 */
export async function runGlobalIngestionNow(): Promise<boolean> {
  try {
    await syncRegistry().catch((err) => logger.error({ err: String(err) }, "Registry sync error"));
    await runGlobalIngestion();
    return true;
  } catch (err) {
    logger.error({ err: String(err) }, "Global ingestion failed");
    return false;
  }
}

/**
 * Weekly SAFE purge: once per week on `purgeWeekday`, hard-delete stale, unreferenced
 * postings (rolling `poolRetentionDays` window). Exported for tests.
 */
export async function maybePurgePool(): Promise<number> {
  const rt = await getRuntimeSettings();
  const { weekday, dateKey } = tzParts(rt.timezone);
  if (weekday !== rt.purgeWeekday) return 0;
  if (lastPurgeDate === dateKey) return 0;
  lastPurgeDate = dateKey;
  try {
    const purged = await purgeStalePostings(config.ingest.poolRetentionDays);
    // Durable seen-ledgers are retained LONGER than the pool so novelty + per-user
    // "already shown" survive across weekly purges; cleaned on their own horizon.
    const seenGone = await purgeStaleJobSeen(config.ingest.jobSeenRetentionDays).catch(() => 0);
    const userSeenGone = await purgeStaleUserJobSeen(config.ingest.userJobSeenRetentionDays).catch(() => 0);
    logger.info(
      { purged, retentionDays: config.ingest.poolRetentionDays, jobSeenPurged: seenGone, userJobSeenPurged: userSeenGone },
      "Weekly pool purge",
    );
    return purged;
  } catch (err) {
    logger.error({ err: String(err) }, "Weekly pool purge failed");
    return 0;
  }
}

/** Daily yield-based Apify budget rebalance (spec Pt 14), once per day. */
export async function maybeRebalanceBudgets(): Promise<void> {
  const { dateKey } = tzParts((await getRuntimeSettings()).timezone);
  if (lastRebalanceDate === dateKey) return;
  lastRebalanceDate = dateKey;
  await rebalanceApifyBudgets().catch((err) => logger.error({ err: String(err) }, "Budget rebalance failed"));
}

/** Daily storage snapshot for the admin infra/cost tab, once per day. */
export async function maybeSnapshotStorage(): Promise<void> {
  const { dateKey } = tzParts((await getRuntimeSettings()).timezone);
  if (lastStorageDate === dateKey) return;
  lastStorageDate = dateKey;
  await snapshotStorage().catch((err) => logger.error({ err: String(err) }, "Storage snapshot failed"));
}

/**
 * LEGACY daily per-user auto-dispatch — OFF by default (per-user runs are
 * user-initiated). When enabled, starts a "scheduled" run for each eligible active
 * subscriber once/day at `autoDispatchHour`. Exported for tests.
 */
export async function dispatchDailyRuns(): Promise<{ dispatched: number; skipped: number }> {
  if (!sched().autoDispatchEnabled) return { dispatched: 0, skipped: 0 };
  const { hour, dateKey } = tzParts((await getRuntimeSettings()).timezone);
  if (hour < sched().autoDispatchHour) return { dispatched: 0, skipped: 0 };
  if (lastDispatchDate === dateKey) return { dispatched: 0, skipped: 0 };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const subs = await prisma.subscription.findMany({ where: { status: "active" }, select: { userId: true } });

  let dispatched = 0;
  let skipped = 0;
  for (const { userId } of subs) {
    try {
      const existing = await prisma.applicationRun.findFirst({
        where: { userId, triggerType: "scheduled", createdAt: { gte: startOfToday } },
        select: { id: true },
      });
      if (existing) { skipped++; continue; }
      if ((await remainingApplications(userId)) <= 0) { skipped++; continue; }
      const run = await createIngestionRun(userId, "scheduled");
      triggerFullPipeline(run.id);
      dispatched++;
    } catch (err) {
      skipped++;
      logger.error({ userId, err: String(err) }, "Daily scheduler: failed to dispatch run");
    }
  }

  lastDispatchDate = dateKey;
  logger.info({ dispatched, skipped, activeSubscribers: subs.length }, "Daily scheduler: batch dispatched");
  return { dispatched, skipped };
}

export function startDailyScheduler(): void {
  if (!sched().enabled) {
    logger.info("Daily scheduler disabled (config.automation.scheduler.enabled=false)");
    return;
  }
  if (timer) return;

  const intervalMs = Math.max(1, sched().checkIntervalMinutes) * 60_000;
  logger.info(
    { globalRunMode: sched().globalRunMode, runHour: sched().runHour, timezone: sched().timezone },
    "Daily scheduler started",
  );

  timer = setInterval(() => {
    void maybeRunGlobalIngestion()
      .then(() => maybePurgePool())
      .then(() => maybeRebalanceBudgets())
      .then(() => maybeSnapshotStorage())
      .then(() => dispatchDailyRuns())
      .catch((err) => logger.error({ err: String(err) }, "Daily scheduler tick error"));
  }, intervalMs);
  timer.unref?.();
}

export function stopDailyScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
