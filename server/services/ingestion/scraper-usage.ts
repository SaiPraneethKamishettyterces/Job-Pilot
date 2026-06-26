// Scraper usage ledger helpers (admin cost tracking). recordScraperEvent writes the
// per-CALL row (Apify: per keyword/query; free: per source per run) into
// ScraperUsageEvent — the job-pulling analog of AIUsageEvent. bumpSourceYield rolls
// per-source new/duplicate counts into today's SourceDailyMetrics so the dashboard
// can show the dedup-waste metric for both free and paid sources. Best-effort: a
// logging failure must never break an ingestion run.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

export type ScraperKind = "apify" | "ats" | "aggregator";
export type ScraperStatus = "ok" | "error" | "capped";

export type ScraperEventInput = {
  runId?: string | null;
  kind: ScraperKind;
  source: string;
  actorName?: string | null;
  query?: string | null;
  itemsReturned?: number;
  itemsNew?: number;
  itemsDuplicate?: number;
  costUsd?: number;
  estimated?: boolean;
  durationMs?: number;
  status?: ScraperStatus;
  errorMessage?: string | null;
};

/** UTC midnight bucket — must match SourceDailyMetrics' per-day unique key. */
function dayBucket(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Record one scraper call (or one free source's per-run summary). */
export async function recordScraperEvent(e: ScraperEventInput): Promise<void> {
  try {
    await prisma.scraperUsageEvent.create({
      data: {
        runId: e.runId ?? null,
        kind: e.kind,
        source: e.source,
        actorName: e.actorName ?? null,
        query: e.query ?? null,
        itemsReturned: e.itemsReturned ?? 0,
        itemsNew: e.itemsNew ?? 0,
        itemsDuplicate: e.itemsDuplicate ?? 0,
        costUsd: e.costUsd ?? 0,
        estimated: e.estimated ?? false,
        durationMs: e.durationMs ?? 0,
        status: e.status ?? "ok",
        errorMessage: e.errorMessage ?? null,
      },
    });
  } catch (err) {
    logger.warn({ source: e.source, err: String(err) }, "recordScraperEvent failed");
  }
}

/**
 * Increment ONLY the provided per-source counters in today's SourceDailyMetrics row.
 * Apify cost + scraped count are recorded by recordApifySpend; this fills the
 * new/duplicate columns (and scraped for free sources, which have no spend row).
 */
export async function bumpSourceYield(
  source: string,
  delta: { scraped?: number; isNew?: number; dup?: number },
): Promise<void> {
  if (!source) return;
  const date = dayBucket();
  const update: Record<string, { increment: number }> = {};
  if (delta.scraped) update["totalScraped"] = { increment: delta.scraped };
  if (delta.isNew) update["totalNew"] = { increment: delta.isNew };
  if (delta.dup) update["totalDuplicates"] = { increment: delta.dup };
  if (!Object.keys(update).length) return;
  await prisma.sourceDailyMetrics
    .upsert({
      where: { date_source: { date, source } },
      create: {
        date,
        source,
        totalScraped: delta.scraped ?? 0,
        totalNew: delta.isNew ?? 0,
        totalDuplicates: delta.dup ?? 0,
      },
      update,
    })
    .catch((err) => logger.warn({ source, err: String(err) }, "bumpSourceYield failed"));
}
