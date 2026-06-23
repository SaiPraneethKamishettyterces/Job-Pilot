import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { prisma } from "../lib/db.js";
import { createIngestionRun } from "../services/ingestion/ingestion-orchestrator.js";
import { runGlobalIngestion } from "../services/ingestion/global-ingestor.js";
import { syncRegistry } from "../services/ingestion/registry-sync.js";
import { triggerFullPipeline } from "./application-pipeline.js";
import { remainingApplications } from "../services/billing/usage-limits.js";

// In-process daily auto-apply scheduler. Ticks on an interval and, once per day at
// or after the configured local hour, starts a fresh run for every active
// subscriber who hasn't already had a scheduled run that day. This is what turns
// `applicationsPerDay` into an actual daily cadence (vs. a per-run cap).
//
// Single-instance design (like retry-worker): the per-user "already ran today" DB
// guard prevents duplicates in the normal single-container deployment. Under
// multi-instance autoscaling there is a small race window — the durable path for
// that is an external scheduler (Cloud Scheduler) hitting a single consumer.

let timer: NodeJS.Timeout | null = null;
// Skip re-scanning once the day's batch has been dispatched (the DB guard remains
// the source of truth across restarts; this is just an optimization).
let lastDispatchDate: string | null = null;
// Same idea for the once-per-day global pool refresh.
let lastIngestDate: string | null = null;

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/**
 * Refresh the shared global job pool at most once per local day, at/after
 * `ingestHour`. User-agnostic — runs before the per-user dispatch so runs read a
 * fresh pool. Exported for tests. Awaited so a same-tick dispatch sees the result.
 */
export async function maybeRunGlobalIngestion(): Promise<boolean> {
  const now = new Date();
  const today = localDateKey(now);
  if (now.getHours() < config.automation.scheduler.ingestHour) return false;
  if (lastIngestDate === today) return false;
  lastIngestDate = today;
  try {
    // Refresh the company registry from the public list first (fail-soft, no-op
    // when unconfigured), so the day's ingestion sees any newly-added companies.
    await syncRegistry().catch((err) => logger.error({ err: String(err) }, "Registry sync error"));
    await runGlobalIngestion();
    return true;
  } catch (err) {
    logger.error({ err: String(err) }, "Daily scheduler: global ingestion failed");
    return false;
  }
}

/** Start a "scheduled" run for each eligible active subscriber. Exported for tests. */
export async function dispatchDailyRuns(): Promise<{ dispatched: number; skipped: number }> {
  const now = new Date();
  const today = localDateKey(now);

  // Only fire at/after the target hour, and at most once per local day.
  if (now.getHours() < config.automation.scheduler.hour) return { dispatched: 0, skipped: 0 };
  if (lastDispatchDate === today) return { dispatched: 0, skipped: 0 };

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const subs = await prisma.subscription.findMany({
    where: { status: "active" },
    select: { userId: true },
  });

  let dispatched = 0;
  let skipped = 0;
  for (const { userId } of subs) {
    try {
      // Idempotency: skip if a scheduled run already exists for this user today.
      const existing = await prisma.applicationRun.findFirst({
        where: { userId, triggerType: "scheduled", createdAt: { gte: startOfToday } },
        select: { id: true },
      });
      if (existing) {
        skipped++;
        continue;
      }
      // Skip users with no monthly allowance left (don't spin up empty runs).
      if ((await remainingApplications(userId)) <= 0) {
        skipped++;
        continue;
      }

      const run = await createIngestionRun(userId, "scheduled");
      triggerFullPipeline(run.id);
      dispatched++;
    } catch (err) {
      skipped++;
      logger.error({ userId, err: String(err) }, "Daily scheduler: failed to dispatch run");
    }
  }

  lastDispatchDate = today;
  logger.info({ dispatched, skipped, activeSubscribers: subs.length }, "Daily scheduler: batch dispatched");
  return { dispatched, skipped };
}

export function startDailyScheduler(): void {
  if (!config.automation.scheduler.enabled) {
    logger.info("Daily scheduler disabled (config.automation.scheduler.enabled=false)");
    return;
  }
  if (timer) return; // already running

  const intervalMs = Math.max(1, config.automation.scheduler.checkIntervalMinutes) * 60_000;
  logger.info(
    { hour: config.automation.scheduler.hour, checkIntervalMinutes: config.automation.scheduler.checkIntervalMinutes },
    "Daily scheduler started",
  );

  timer = setInterval(() => {
    // Refresh the global pool first (once/day at ingestHour), then dispatch the
    // per-user runs (once/day at hour) which read from it.
    void maybeRunGlobalIngestion()
      .then(() => dispatchDailyRuns())
      .catch((err) => {
        logger.error({ err: String(err) }, "Daily scheduler tick error");
      });
  }, intervalMs);
  // Don't keep the process alive solely for this timer.
  timer.unref?.();
}

export function stopDailyScheduler(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
