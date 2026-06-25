// Apify real-dollar spend guard (spec Pt 14 + admin spend cap). A HARD daily cap
// (default $5, admin-editable) is checked BEFORE every paid Apify run and the
// on-demand admin test pull, so a real token can never run uncapped. Spend is
// recorded per-source per-day in SourceDailyMetrics, which also feeds the admin
// Job-Pulling Expenses page and the cost_per_high_match_job yield metric.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { getRuntimeSettings } from "../admin/runtime-settings.js";

const APIFY_SOURCES = ["linkedin", "indeed", "hiringcafe"];

/** UTC midnight bucket for the per-day unique key. */
function dayBucket(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Real-dollar Apify spend recorded so far today. */
export async function apifySpendTodayUsd(): Promise<number> {
  const rows = await prisma.sourceDailyMetrics.findMany({
    where: { date: dayBucket(), source: { in: APIFY_SOURCES } },
    select: { costUsd: true },
  });
  return rows.reduce((sum, r) => sum + (r.costUsd ?? 0), 0);
}

export type BudgetStatus = {
  spentUsd: number;
  softUsd: number;
  hardUsd: number;
  softExceeded: boolean;
  hardExceeded: boolean;
  remainingUsd: number;
};

export async function apifyBudgetStatus(): Promise<BudgetStatus> {
  const [spentUsd, rt] = await Promise.all([apifySpendTodayUsd(), getRuntimeSettings()]);
  const softUsd = rt.apifySpendSoftUsdPerDay;
  const hardUsd = rt.apifySpendHardUsdPerDay;
  return {
    spentUsd,
    softUsd,
    hardUsd,
    softExceeded: spentUsd >= softUsd,
    hardExceeded: spentUsd >= hardUsd,
    remainingUsd: Math.max(0, hardUsd - spentUsd),
  };
}

/**
 * Gate before a paid Apify run. Returns false (and logs) when today's spend has
 * hit the hard cap — callers MUST skip the run. Warns at the soft threshold.
 */
export async function canSpendApify(): Promise<boolean> {
  const s = await apifyBudgetStatus();
  if (s.hardExceeded) {
    logger.warn({ spent: s.spentUsd, hard: s.hardUsd }, "Apify hard spend cap reached — skipping paid run");
    return false;
  }
  if (s.softExceeded) {
    logger.warn({ spent: s.spentUsd, soft: s.softUsd }, "Apify soft spend threshold reached");
  }
  return true;
}

/** Estimate a run's USD cost: prefer the actor-reported usage, else a fallback rate. */
export function estimateRunCostUsd(run: { usageTotalUsd?: number | null } | null, itemCount: number): number {
  const reported = run?.usageTotalUsd;
  if (typeof reported === "number" && reported > 0) return reported;
  return itemCount * config.apify.fallbackUsdPerResult;
}

/** Record an Apify run's spend + counts into today's per-source metrics row. */
export async function recordApifySpend(
  source: string,
  actorName: string,
  costUsd: number,
  scraped: number,
): Promise<void> {
  const date = dayBucket();
  await prisma.sourceDailyMetrics
    .upsert({
      where: { date_source: { date, source } },
      create: { date, source, actorName, costUsd, totalScraped: scraped, actorRuns: 1 },
      update: {
        actorName,
        costUsd: { increment: costUsd },
        totalScraped: { increment: scraped },
        actorRuns: { increment: 1 },
      },
    })
    .catch((err) => logger.warn({ source, err: String(err) }, "recordApifySpend failed"));
}
