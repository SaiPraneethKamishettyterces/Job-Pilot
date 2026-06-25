import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";
import { config } from "../lib/config.js";
import { triggerGlobalIngestion } from "../services/ingestion/global-ingestor.js";
import { apifyBudgetStatus } from "../services/ingestion/apify-budget.js";
import { getRuntimeSettings, setRuntimeSettings } from "../services/admin/runtime-settings.js";

export const adminRouter = Router();
adminRouter.use(requireAuth, requireAdmin);

// Canonical paid-scraper sources. Jobright has no Apify actor → reserved/disabled.
const SCRAPER_SOURCES = ["linkedin", "indeed", "hiringcafe", "jobright"] as const;
const NO_ACTOR = new Set(["jobright"]);

/** Ensure a config row exists for every known source (idempotent). */
async function ensureScraperRows(): Promise<void> {
  await prisma.scraperSourceConfig.createMany({
    data: SCRAPER_SOURCES.map((sourceKey) => ({ sourceKey, enabled: false, maxJobsPerRun: 25 })),
    skipDuplicates: true,
  });
}

// ─── GET /api/admin/scrapers ──────────────────────────────────────────────────
adminRouter.get("/scrapers", asyncHandler(async (_req: AuthRequest, res) => {
  await ensureScraperRows();
  const rows = await prisma.scraperSourceConfig.findMany({ orderBy: { sourceKey: "asc" } });
  res.json({
    sources: rows.map((r) => ({
      sourceKey: r.sourceKey,
      enabled: r.enabled,
      maxJobsPerRun: r.maxJobsPerRun,
      hasActor: !NO_ACTOR.has(r.sourceKey),
      note: NO_ACTOR.has(r.sourceKey) ? "No Apify actor available — reserved/disabled." : null,
      updatedAt: r.updatedAt,
    })),
  });
}));

// ─── PUT /api/admin/scrapers/:sourceKey ───────────────────────────────────────
adminRouter.put("/scrapers/:sourceKey", asyncHandler(async (req: AuthRequest, res) => {
  const sourceKey = req.params["sourceKey"] as string;
  if (!SCRAPER_SOURCES.includes(sourceKey as (typeof SCRAPER_SOURCES)[number])) {
    throw badRequest(`Unknown scraper source: ${sourceKey}`);
  }
  const enabled = Boolean(req.body?.enabled);
  const maxJobsPerRun = Number(req.body?.maxJobsPerRun);
  if (!Number.isFinite(maxJobsPerRun) || maxJobsPerRun < 0 || maxJobsPerRun > 1000) {
    throw badRequest("maxJobsPerRun must be between 0 and 1000");
  }
  if (enabled && NO_ACTOR.has(sourceKey)) {
    throw badRequest(`${sourceKey} cannot be enabled — no Apify actor available.`);
  }
  await ensureScraperRows();
  const updated = await prisma.scraperSourceConfig.update({
    where: { sourceKey },
    data: { enabled, maxJobsPerRun },
  });
  logger.info({ sourceKey, enabled, maxJobsPerRun }, "Admin updated scraper config");
  res.json({ sourceKey: updated.sourceKey, enabled: updated.enabled, maxJobsPerRun: updated.maxJobsPerRun });
}));

// ─── GET /api/admin/ingestion ─────────────────────────────────────────────────
// Visibility: recent ingest runs + registry/pool sizes.
adminRouter.get("/ingestion", asyncHandler(async (_req: AuthRequest, res) => {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [runs, registrySize, activeSources, verifiedSources, poolSize, newLast24h] = await Promise.all([
    prisma.globalIngestRun.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.jobSource.count(),
    prisma.jobSource.count({ where: { isActive: true } }),
    prisma.jobSource.count({ where: { lastSuccessAt: { not: null } } }),
    prisma.jobPosting.count(),
    prisma.jobPosting.count({ where: { firstSeenAt: { gt: since24h } } }),
  ]);
  res.json({
    registry: { total: registrySize, active: activeSources, verified: verifiedSources },
    pool: { postings: poolSize, newLast24h },
    runs: runs.map((r) => ({
      id: r.id,
      sourceTag: r.sourceTag,
      status: r.status,
      boardsFetched: r.boardsFetched,
      keywordsUsed: r.keywordsUsed,
      postingsDiscovered: r.postingsDiscovered,
      postingsInserted: r.postingsInserted,
      postingsUpdated: r.postingsUpdated,
      postingsEmbedded: r.postingsEmbedded,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
  });
}));

// ─── POST /api/admin/ingestion/run ────────────────────────────────────────────
// Manually refresh the pool now (free ATS + aggregators, then the enabled paid
// scrapers). Returns immediately; progress shows up in GET /ingestion. The Apify
// portion is spend-capped ($5/day hard) and skipped on weekends automatically.
adminRouter.post("/ingestion/run", asyncHandler(async (_req: AuthRequest, res) => {
  triggerGlobalIngestion();
  logger.info("Admin triggered manual ingestion run");
  res.status(202).json({ message: "Ingestion started" });
}));

// ─── GET /api/admin/job-analytics ─────────────────────────────────────────────
// Everything about the job pool: volume, novelty (new vs re-seen), date coverage
// (truly-fresh postedAt vs "date unknown" — where the PULL date = the date we first
// saw it / firstSeenAt), de-dup ratio, by-source contribution, most/least common
// roles + companies, and a daily new-jobs trend.
adminRouter.get("/job-analytics", asyncHandler(async (req: AuthRequest, res) => {
  const days = Math.min(60, Math.max(1, Number(req.query["days"]) || 14));

  const [overview, dateCoverage, bySource, topRoles, bottomRoles, topCompanies, trend, runAgg] = await Promise.all([
    // Pool volume + de-dup ratio (distinct logical jobs = JobSeen canonicalKeys).
    prisma.$queryRaw<{ total: number; active: number; distinctjobs: number; newseen24h: number }[]>`
      SELECT
        (SELECT COUNT(*)::int FROM "JobPosting") AS total,
        (SELECT COUNT(*)::int FROM "JobPosting" WHERE "postingStatus" = 'active') AS active,
        (SELECT COUNT(*)::int FROM "JobSeen") AS distinctjobs,
        (SELECT COUNT(*)::int FROM "JobPosting" WHERE "firstSeenAt" > now() - interval '24 hours') AS newseen24h`,
    // Date coverage: released-in-24h (real postedAt) vs older vs UNKNOWN date.
    prisma.$queryRaw<{ postedlast24h: number; postedolder: number; nodate: number }[]>`
      SELECT
        COUNT(*) FILTER (WHERE "postedAt" IS NOT NULL AND "postedAt" > now() - interval '24 hours')::int AS postedlast24h,
        COUNT(*) FILTER (WHERE "postedAt" IS NOT NULL AND "postedAt" <= now() - interval '24 hours')::int AS postedolder,
        COUNT(*) FILTER (WHERE "postedAt" IS NULL)::int AS nodate
      FROM "JobPosting" WHERE "postingStatus" = 'active'`,
    // Contribution by source (+ how many new in last 24h by firstSeenAt).
    prisma.$queryRaw<{ source: string | null; total: number; new24h: number; nodate: number }[]>`
      SELECT "sourceName" AS source,
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "firstSeenAt" > now() - interval '24 hours')::int AS new24h,
        COUNT(*) FILTER (WHERE "postedAt" IS NULL)::int AS nodate
      FROM "JobPosting" WHERE "postingStatus" = 'active'
      GROUP BY "sourceName" ORDER BY total DESC`,
    // Most common roles.
    prisma.$queryRaw<{ role: string | null; c: number }[]>`
      SELECT "normalizedTitle" AS role, COUNT(*)::int AS c
      FROM "JobPosting" WHERE "postingStatus" = 'active' AND "normalizedTitle" IS NOT NULL AND "normalizedTitle" <> ''
      GROUP BY "normalizedTitle" ORDER BY c DESC LIMIT 15`,
    // Least common roles (rare/niche — at least one posting).
    prisma.$queryRaw<{ role: string | null; c: number }[]>`
      SELECT "normalizedTitle" AS role, COUNT(*)::int AS c
      FROM "JobPosting" WHERE "postingStatus" = 'active' AND "normalizedTitle" IS NOT NULL AND "normalizedTitle" <> ''
      GROUP BY "normalizedTitle" ORDER BY c ASC, role ASC LIMIT 15`,
    // Top companies by posting count.
    prisma.$queryRaw<{ company: string; c: number }[]>`
      SELECT "company", COUNT(*)::int AS c
      FROM "JobPosting" WHERE "postingStatus" = 'active'
      GROUP BY "company" ORDER BY c DESC LIMIT 15`,
    // New-jobs-per-day trend (by firstSeenAt = the pull/seen date).
    prisma.$queryRaw<{ day: Date; c: number }[]>`
      SELECT date_trunc('day', "firstSeenAt") AS day, COUNT(*)::int AS c
      FROM "JobPosting" WHERE "firstSeenAt" > now() - (${days} || ' days')::interval
      GROUP BY day ORDER BY day ASC`,
    // Ingestion volume over the window (discovered vs new-inserted vs re-seen).
    prisma.$queryRaw<{ discovered: number; inserted: number; updated: number; runs: number }[]>`
      SELECT COALESCE(SUM("postingsDiscovered"),0)::int AS discovered,
        COALESCE(SUM("postingsInserted"),0)::int AS inserted,
        COALESCE(SUM("postingsUpdated"),0)::int AS updated,
        COUNT(*)::int AS runs
      FROM "GlobalIngestRun" WHERE "createdAt" > now() - (${days} || ' days')::interval AND "status" = 'COMPLETED'`,
  ]);

  const ov = overview[0] ?? { total: 0, active: 0, distinctjobs: 0, newseen24h: 0 };
  res.json({
    windowDays: days,
    pool: {
      total: ov.total,
      active: ov.active,
      distinctJobs: ov.distinctjobs, // unique logical jobs (canonicalKey) — de-dup target
      duplicationRatio: ov.distinctjobs ? Number((ov.active / ov.distinctjobs).toFixed(1)) : 0,
      newSeenLast24h: ov.newseen24h, // first seen by us in last 24h (the "pull date")
    },
    dateCoverage: {
      // NOTE: pull date = the date WE first saw a posting (firstSeenAt). postedAt is
      // the source's release date and is often missing.
      releasedLast24h: dateCoverage[0]?.postedlast24h ?? 0, // real postedAt within 24h
      releasedOlder: dateCoverage[0]?.postedolder ?? 0,
      dateUnknown: dateCoverage[0]?.nodate ?? 0, // no postedAt — we rely on firstSeenAt
    },
    bySource: bySource.map((s) => ({ source: s.source ?? "(unknown)", total: s.total, new24h: s.new24h, dateUnknown: s.nodate })),
    topRoles: topRoles.map((r) => ({ role: r.role, count: r.c })),
    bottomRoles: bottomRoles.map((r) => ({ role: r.role, count: r.c })),
    topCompanies: topCompanies.map((c) => ({ company: c.company, count: c.c })),
    trend: trend.map((t) => ({ date: t.day.toISOString().slice(0, 10), newJobs: t.c })),
    ingestion: runAgg[0] ?? { discovered: 0, inserted: 0, updated: 0, runs: 0 },
  });
}));

// ─── GET/PUT /api/admin/settings ──────────────────────────────────────────────
// Live, admin-editable runtime settings (spec Pt 18): spend caps, global-run
// mode/hour/timezone/weekend, 50/50 split %, purge weekday. Changes take effect
// without a redeploy (env values are the defaults).
adminRouter.get("/settings", asyncHandler(async (_req: AuthRequest, res) => {
  res.json(await getRuntimeSettings());
}));

adminRouter.put("/settings", asyncHandler(async (req: AuthRequest, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  if (typeof body !== "object") throw badRequest("Body must be an object of settings");
  const updated = await setRuntimeSettings(body);
  logger.info({ keys: Object.keys(body) }, "Admin updated runtime settings");
  res.json(updated);
}));

// ─── GET /api/admin/expenses ──────────────────────────────────────────────────
// Job-Pulling Expenses page data: Apify spend per source (today + last N days),
// budget status ($/day cap + remaining), cost-per-high-match yield, pool freshness,
// and the global-run mode/schedule. Powers the admin expenses dashboard.
adminRouter.get("/expenses", asyncHandler(async (req: AuthRequest, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query["days"]) || 14));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);
  const sinceDay = new Date(Date.UTC(since.getUTCFullYear(), since.getUTCMonth(), since.getUTCDate()));

  const [budget, metrics, lastRun, poolSize, hmRows] = await Promise.all([
    apifyBudgetStatus(),
    prisma.sourceDailyMetrics.findMany({ where: { date: { gte: sinceDay } }, orderBy: { date: "asc" } }),
    prisma.globalIngestRun.findFirst({ orderBy: { createdAt: "desc" } }),
    prisma.jobPosting.count({ where: { postingStatus: "active" } }),
    prisma.$queryRaw<{ source: string | null; count: number }[]>`
      SELECT jp."sourceName" AS source, COUNT(*)::int AS count
      FROM "JobMatch" m
      JOIN "Job" j ON j.id = m."jobId"
      JOIN "JobPosting" jp ON jp.id = j."postingId"
      WHERE m.score >= 80 AND m."createdAt" >= ${sinceDay}
      GROUP BY jp."sourceName"`,
  ]);

  // Per-source roll-up across the window.
  const bySource = new Map<string, { costUsd: number; scraped: number; runs: number }>();
  for (const m of metrics) {
    const cur = bySource.get(m.source) ?? { costUsd: 0, scraped: 0, runs: 0 };
    cur.costUsd += m.costUsd;
    cur.scraped += m.totalScraped;
    cur.runs += m.actorRuns;
    bySource.set(m.source, cur);
  }
  const highMatch = new Map(hmRows.map((r) => [r.source ?? "", Number(r.count)]));
  const sources = [...bySource.entries()].map(([source, v]) => ({
    source,
    costUsd: Number(v.costUsd.toFixed(4)),
    totalScraped: v.scraped,
    actorRuns: v.runs,
    jobsHighMatch: highMatch.get(source) ?? 0,
    costPerHighMatchJob: (highMatch.get(source) ?? 0) > 0 ? Number((v.costUsd / highMatch.get(source)!).toFixed(4)) : null,
  }));
  const totalCostUsd = Number(sources.reduce((s, x) => s + x.costUsd, 0).toFixed(4));

  // Daily cost trend (for the chart): { date, costUsd } summed across sources.
  const trendMap = new Map<string, number>();
  for (const m of metrics) {
    const key = m.date.toISOString().slice(0, 10);
    trendMap.set(key, (trendMap.get(key) ?? 0) + m.costUsd);
  }
  const trend = [...trendMap.entries()].map(([date, costUsd]) => ({ date, costUsd: Number(costUsd.toFixed(4)) }));

  res.json({
    budget, // { spentUsd, softUsd, hardUsd, softExceeded, hardExceeded, remainingUsd }
    windowDays: days,
    totalCostUsd,
    sources,
    trend,
    pool: {
      activePostings: poolSize,
      lastGlobalRunAt: lastRun?.completedAt?.toISOString() ?? lastRun?.startedAt?.toISOString() ?? null,
      lastGlobalRunStatus: lastRun?.status ?? null,
    },
    globalRun: {
      mode: config.automation.scheduler.globalRunMode,
      runHour: config.automation.scheduler.runHour,
      timezone: config.automation.scheduler.timezone,
      weekendIngest: config.automation.scheduler.weekendIngest,
    },
    tokenConfigured: Boolean(config.apify.token),
  });
}));
