// Source budget manager + yield feedback (spec Pt 5 + 14). Decides how many items
// each paid source may pull, and rebalances those budgets daily from real yield
// (cost_per_high_match_job): sources that convert spend into good matches get more
// budget; expensive/low-yield sources get less. HiringCafe keeps a floor because
// it's the aggregator we pull first (best coverage per dollar). Pure helpers are
// unit-tested; rebalanceApifyBudgets persists to ScraperSourceConfig.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

// Apify source order: HiringCafe first (aggregator → best coverage/$), then Indeed,
// then LinkedIn (discovery). Used for tie-breaking + the HiringCafe budget floor.
export const APIFY_SOURCE_ORDER = ["hiringcafe", "indeed", "linkedin"];

export type BudgetInputs = {
  base: number;
  demandWeight: number;
  candidateCount: number;
  scarcityBoost: number;
  lowYieldPenalty: number;
};

/** Dynamic per-source/per-cluster limit (spec Pt 5). Never negative. */
export function computeClusterSourceLimit(i: BudgetInputs): number {
  const v = i.base + i.demandWeight * i.candidateCount + i.scarcityBoost - i.lowYieldPenalty;
  return Math.max(0, Math.round(v));
}

export type SourceYield = { source: string; costUsd: number; jobsHighMatch: number };

/** USD spent per 80+ match from a source. Infinity when it produced spend but no
 *  high-match jobs; 0 when it cost nothing. Lower is better. */
export function costPerHighMatchJob(y: SourceYield): number {
  if (y.jobsHighMatch <= 0) return y.costUsd > 0 ? Infinity : 0;
  return y.costUsd / y.jobsHighMatch;
}

export type RebalanceOpts = {
  minBudget: number;
  maxBudget: number;
  // cost-per-high-match thresholds (USD): below `good` → raise; above `bad` → cut.
  goodThreshold: number;
  badThreshold: number;
  step: number; // how much to raise/lower per day
  hiringCafeFloor: number; // HiringCafe never drops below this (pulled first)
};

export const DEFAULT_REBALANCE: RebalanceOpts = {
  minBudget: 10,
  maxBudget: 500,
  goodThreshold: 0.05,
  badThreshold: 0.25,
  step: 25,
  hiringCafeFloor: 50,
};

/**
 * New budget for a source given its current budget + yesterday's yield. Pure +
 * bounded. HiringCafe gets a floor. Sources with spend-but-no-matches are cut hard.
 */
export function nextApifyBudget(source: string, current: number, y: SourceYield, opts = DEFAULT_REBALANCE): number {
  // No data (no spend, no matches) → leave the budget unchanged.
  if (y.costUsd <= 0 && y.jobsHighMatch <= 0) {
    const same = Math.max(opts.minBudget, Math.min(opts.maxBudget, current));
    return source === "hiringcafe" ? Math.max(same, opts.hiringCafeFloor) : same;
  }
  const cphm = costPerHighMatchJob(y);
  let next = current;
  if (cphm === Infinity) next = current - opts.step * 2; // spent, zero good matches → cut hard
  else if (cphm > opts.badThreshold) next = current - opts.step;
  else if (cphm < opts.goodThreshold) next = current + opts.step;
  next = Math.max(opts.minBudget, Math.min(opts.maxBudget, next));
  if (source === "hiringcafe") next = Math.max(next, opts.hiringCafeFloor);
  return next;
}

/** UTC midnight bucket N days ago. */
function dayBucket(daysAgo = 0): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysAgo));
}

/**
 * Daily rebalance: read yesterday's per-source metrics and adjust each enabled
 * Apify source's maxJobsPerRun by yield. Fail-soft; returns the new budgets.
 */
export async function rebalanceApifyBudgets(opts = DEFAULT_REBALANCE): Promise<Record<string, number>> {
  const yStart = dayBucket(1);
  const yEnd = dayBucket(0);
  const metrics = await prisma.sourceDailyMetrics.findMany({
    where: { date: yStart, source: { in: APIFY_SOURCE_ORDER } },
  });
  const bySource = new Map(metrics.map((m) => [m.source, m]));
  // High-match (80+) counts per source from yesterday's JobMatches → JobPosting.sourceName.
  const hmRows = await prisma.$queryRaw<{ source: string | null; count: number }[]>`
    SELECT jp."sourceName" AS source, COUNT(*)::int AS count
    FROM "JobMatch" m
    JOIN "Job" j ON j.id = m."jobId"
    JOIN "JobPosting" jp ON jp.id = j."postingId"
    WHERE m.score >= 80 AND m."createdAt" >= ${yStart} AND m."createdAt" < ${yEnd}
    GROUP BY jp."sourceName"`;
  const highMatch = new Map(hmRows.map((r) => [r.source ?? "", Number(r.count)]));
  const configs = await prisma.scraperSourceConfig.findMany({ where: { enabled: true } });
  const result: Record<string, number> = {};
  for (const cfg of configs) {
    if (!APIFY_SOURCE_ORDER.includes(cfg.sourceKey)) continue;
    const m = bySource.get(cfg.sourceKey);
    const y: SourceYield = {
      source: cfg.sourceKey,
      costUsd: m?.costUsd ?? 0,
      jobsHighMatch: highMatch.get(cfg.sourceKey) ?? 0,
    };
    const next = nextApifyBudget(cfg.sourceKey, cfg.maxJobsPerRun, y, opts);
    if (next !== cfg.maxJobsPerRun) {
      await prisma.scraperSourceConfig
        .update({ where: { id: cfg.id }, data: { maxJobsPerRun: next } })
        .catch((err) => logger.warn({ source: cfg.sourceKey, err: String(err) }, "budget update failed"));
    }
    result[cfg.sourceKey] = next;
  }
  logger.info({ budgets: result }, "Apify budgets rebalanced from yield");
  return result;
}
