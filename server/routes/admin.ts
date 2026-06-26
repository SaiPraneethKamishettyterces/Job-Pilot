import { Router } from "express";
import { Prisma } from "@prisma/client";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";
import { config } from "../lib/config.js";
import { triggerGlobalIngestion } from "../services/ingestion/global-ingestor.js";
import { apifyBudgetStatus } from "../services/ingestion/apify-budget.js";
import { snapshotStorage } from "../services/admin/storage-metrics.js";
import { getRuntimeSettings, setRuntimeSettings } from "../services/admin/runtime-settings.js";

const GB = 1_000_000_000;

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

  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayOfMonth = now.getUTCDate();
  const daysInMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();

  const [budget, metrics, lastRun, poolSize, hmRows, embedRows, recentRuns, mtdEmbed] = await Promise.all([
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
    // Embedding cost attributed per source (jobs first seen in the window). This is
    // the "free isn't free" line — free sources pay $0 to fetch but cost to embed.
    prisma.$queryRaw<{ source: string | null; embed: number }[]>`
      SELECT "sourceName" AS source, COALESCE(SUM("embedCostUsd"), 0)::float8 AS embed
      FROM "JobPosting" WHERE "firstSeenAt" >= ${sinceDay} GROUP BY "sourceName"`,
    // Per-run drill-down (most recent runs with their cost).
    prisma.globalIngestRun.findMany({ orderBy: { createdAt: "desc" }, take: 15 }),
    // Month-to-date embedding spend (apify MTD is summed from metrics below).
    prisma.globalIngestRun.aggregate({ where: { createdAt: { gte: startOfMonth } }, _sum: { embedCostUsd: true } }),
  ]);

  // Per-source roll-up across the window (apify spend + counts + embedding cost).
  type Agg = { costUsd: number; scraped: number; runs: number; newJobs: number; dups: number };
  const bySource = new Map<string, Agg>();
  for (const m of metrics) {
    const cur = bySource.get(m.source) ?? { costUsd: 0, scraped: 0, runs: 0, newJobs: 0, dups: 0 };
    cur.costUsd += m.costUsd;
    cur.scraped += m.totalScraped;
    cur.runs += m.actorRuns;
    cur.newJobs += m.totalNew;
    cur.dups += m.totalDuplicates;
    bySource.set(m.source, cur);
  }
  const embedBySource = new Map(embedRows.map((r) => [r.source ?? "", Number(r.embed)]));
  for (const s of embedBySource.keys()) if (!bySource.has(s)) bySource.set(s, { costUsd: 0, scraped: 0, runs: 0, newJobs: 0, dups: 0 });
  const highMatch = new Map(hmRows.map((r) => [r.source ?? "", Number(r.count)]));

  const sources = [...bySource.entries()]
    .map(([source, v]) => {
      const embedUsd = Number((embedBySource.get(source) ?? 0).toFixed(4));
      const hm = highMatch.get(source) ?? 0;
      const totalCost = Number((v.costUsd + embedUsd).toFixed(4));
      return {
        source,
        costUsd: Number(v.costUsd.toFixed(4)), // paid scraper spend (Apify)
        embedCostUsd: embedUsd,
        totalCostUsd: totalCost, // unified: acquisition + embedding
        totalScraped: v.scraped,
        totalNew: v.newJobs,
        totalDuplicates: v.dups,
        dedupRatio: v.scraped > 0 ? Number((v.dups / v.scraped).toFixed(2)) : null,
        actorRuns: v.runs,
        jobsHighMatch: hm,
        costPerHighMatchJob: hm > 0 ? Number((totalCost / hm).toFixed(4)) : null,
        costPerNewJob: v.newJobs > 0 && v.costUsd > 0 ? Number((v.costUsd / v.newJobs).toFixed(4)) : null,
      };
    })
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd || b.totalScraped - a.totalScraped);

  const totalCostUsd = Number(sources.reduce((s, x) => s + x.costUsd, 0).toFixed(4));
  const totalEmbedCostUsd = Number(sources.reduce((s, x) => s + x.embedCostUsd, 0).toFixed(4));
  const unifiedTotalUsd = Number((totalCostUsd + totalEmbedCostUsd).toFixed(4));

  // Month-to-date + linear run-rate projection (apify spend; embed is tiny/free-tier).
  const apifyMtd = metrics
    .filter((m) => m.date >= startOfMonth && ["linkedin", "indeed", "hiringcafe"].includes(m.source))
    .reduce((s, m) => s + m.costUsd, 0);
  const embedMtd = Number(mtdEmbed._sum.embedCostUsd ?? 0);
  const mtdUsd = Number((apifyMtd + embedMtd).toFixed(4));
  const projectedMonthUsd = dayOfMonth > 0 ? Number(((mtdUsd / dayOfMonth) * daysInMonth).toFixed(2)) : 0;

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
    totalEmbedCostUsd,
    unifiedTotalUsd,
    projection: { monthToDateUsd: mtdUsd, projectedMonthUsd },
    sources,
    trend,
    runs: recentRuns.map((r) => ({
      id: r.id,
      sourceTag: r.sourceTag,
      status: r.status,
      costUsd: Number((r.costUsd ?? 0).toFixed(4)),
      embedCostUsd: Number((r.embedCostUsd ?? 0).toFixed(4)),
      callCount: r.callCount,
      postingsDiscovered: r.postingsDiscovered,
      postingsInserted: r.postingsInserted,
      postingsEmbedded: r.postingsEmbedded,
      startedAt: r.startedAt?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
    })),
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

// ─── GET /api/admin/scraper-runs ──────────────────────────────────────────────
// Per-CALL scraper drill-down from ScraperUsageEvent: recent calls, per-keyword
// cost rollup (Apify), and per-source reliability (error rate + avg latency).
adminRouter.get("/scraper-runs", asyncHandler(async (req: AuthRequest, res) => {
  const days = Math.min(90, Math.max(1, Number(req.query["days"]) || 7));
  const source = typeof req.query["source"] === "string" ? (req.query["source"] as string) : undefined;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const where = { createdAt: { gte: since }, ...(source ? { source } : {}) };

  const [events, byKeyword, reliability] = await Promise.all([
    prisma.scraperUsageEvent.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 }),
    // Per-keyword cost (Apify calls carry a query); the highest-cost search terms.
    prisma.$queryRaw<{ source: string; query: string | null; calls: number; cost: number; items: number }[]>`
      SELECT "source", "query",
        COUNT(*)::int AS calls,
        COALESCE(SUM("costUsd"), 0)::float8 AS cost,
        COALESCE(SUM("itemsReturned"), 0)::int AS items
      FROM "ScraperUsageEvent"
      WHERE "createdAt" >= ${since} AND "kind" = 'apify' AND "query" IS NOT NULL
      GROUP BY "source", "query" ORDER BY cost DESC LIMIT 50`,
    // Source reliability: error rate + average latency + items per call.
    prisma.$queryRaw<{ source: string; calls: number; errors: number; capped: number; avgms: number; items: number }[]>`
      SELECT "source",
        COUNT(*)::int AS calls,
        COUNT(*) FILTER (WHERE "status" = 'error')::int AS errors,
        COUNT(*) FILTER (WHERE "status" = 'capped')::int AS capped,
        COALESCE(AVG("durationMs"), 0)::float8 AS avgms,
        COALESCE(SUM("itemsReturned"), 0)::int AS items
      FROM "ScraperUsageEvent" WHERE "createdAt" >= ${since}
      GROUP BY "source" ORDER BY calls DESC`,
  ]);

  res.json({
    windowDays: days,
    events: events.map((e) => ({
      id: e.id, runId: e.runId, kind: e.kind, source: e.source, actorName: e.actorName, query: e.query,
      itemsReturned: e.itemsReturned, itemsNew: e.itemsNew, itemsDuplicate: e.itemsDuplicate,
      costUsd: Number(e.costUsd.toFixed(4)), estimated: e.estimated, durationMs: e.durationMs,
      status: e.status, createdAt: e.createdAt.toISOString(),
    })),
    byKeyword: byKeyword.map((k) => ({
      source: k.source, query: k.query, calls: Number(k.calls),
      costUsd: Number(Number(k.cost).toFixed(4)), items: Number(k.items),
      costPerItem: Number(k.items) > 0 ? Number((Number(k.cost) / Number(k.items)).toFixed(4)) : null,
    })),
    reliability: reliability.map((r) => ({
      source: r.source, calls: Number(r.calls), errors: Number(r.errors), capped: Number(r.capped),
      errorRate: Number(r.calls) > 0 ? Number((Number(r.errors) / Number(r.calls)).toFixed(2)) : 0,
      avgDurationMs: Math.round(Number(r.avgms)), items: Number(r.items),
    })),
  });
}));

// ─── GET /api/admin/storage ───────────────────────────────────────────────────
// Storage/infra breakdown from the daily StorageDailyMetric snapshots: DB + per-table
// + per-source + artifact-blob bytes, growth rate, and projected GCP cost (Cloud SQL
// for the DB, GCS for the blobs) once the single-Postgres app migrates to cloud.
adminRouter.get("/storage", asyncHandler(async (req: AuthRequest, res) => {
  const days = Math.min(180, Math.max(2, Number(req.query["days"]) || 30));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Bootstrap: if no snapshot exists yet, take one now so the tab isn't empty.
  const any = await prisma.storageDailyMetric.findFirst({ select: { id: true } });
  if (!any) await snapshotStorage();

  const latestDbRow = await prisma.storageDailyMetric.findFirst({
    where: { scope: "database" }, orderBy: { date: "desc" },
  });
  const latestDate = latestDbRow?.date ?? null;
  const n = (v: bigint) => Number(v);

  const [tables, sources, artifactTypes, topUsers, dbTrend, firstDbRow] = await Promise.all([
    latestDate ? prisma.storageDailyMetric.findMany({ where: { scope: "table", date: latestDate }, orderBy: { bytesTotal: "desc" } }) : [],
    latestDate ? prisma.storageDailyMetric.findMany({ where: { scope: "source", date: latestDate }, orderBy: { bytesTotal: "desc" } }) : [],
    latestDate ? prisma.storageDailyMetric.findMany({ where: { scope: "artifactType", date: latestDate }, orderBy: { bytesTotal: "desc" } }) : [],
    latestDate ? prisma.storageDailyMetric.findMany({ where: { scope: "user", date: latestDate }, orderBy: { bytesTotal: "desc" }, take: 20 }) : [],
    prisma.storageDailyMetric.findMany({ where: { scope: "database", date: { gte: since } }, orderBy: { date: "asc" } }),
    prisma.storageDailyMetric.findFirst({ where: { scope: "database", date: { gte: since } }, orderBy: { date: "asc" } }),
  ]);

  const dbBytes = latestDbRow ? n(latestDbRow.bytesTotal) : 0;
  const blobBytes = artifactTypes.reduce((s, a) => s + n(a.bytesTotal), 0);

  // Growth rate from the earliest→latest database snapshot in the window.
  let growthBytesPerDay = 0;
  if (firstDbRow && latestDbRow && latestDate) {
    const spanDays = Math.max(1, (latestDate.getTime() - firstDbRow.date.getTime()) / 86_400_000);
    growthBytesPerDay = (dbBytes - n(firstDbRow.bytesTotal)) / spanDays;
  }

  res.json({
    asOf: latestDate ? latestDate.toISOString().slice(0, 10) : null,
    database: { bytesTotal: dbBytes, gb: Number((dbBytes / GB).toFixed(3)) },
    blob: { bytesTotal: blobBytes, gb: Number((blobBytes / GB).toFixed(3)) },
    projection: {
      dbUsdPerMonth: Number(((dbBytes / GB) * config.storage.cloudDbUsdPerGbMonth).toFixed(2)),
      blobUsdPerMonth: Number(((blobBytes / GB) * config.storage.cloudBlobUsdPerGbMonth).toFixed(2)),
      dbRateUsdPerGbMonth: config.storage.cloudDbUsdPerGbMonth,
      blobRateUsdPerGbMonth: config.storage.cloudBlobUsdPerGbMonth,
    },
    growth: {
      bytesPerDay: Math.round(growthBytesPerDay),
      gbPerDay: Number((growthBytesPerDay / GB).toFixed(4)),
      projectedGb30d: Number(((dbBytes + growthBytesPerDay * 30) / GB).toFixed(3)),
    },
    tables: tables.map((t) => ({
      key: t.key, bytesTotal: n(t.bytesTotal), bytesHeap: n(t.bytesHeap), bytesIndex: n(t.bytesIndex),
      bytesToast: n(t.bytesToast), rowCount: n(t.rowCount),
    })),
    sources: sources.map((s) => ({ key: s.key, bytesTotal: n(s.bytesTotal), rowCount: n(s.rowCount) })),
    artifactTypes: artifactTypes.map((a) => ({ key: a.key, bytesTotal: n(a.bytesTotal), rowCount: n(a.rowCount) })),
    topUsers: topUsers.map((u) => ({ key: u.key, bytesTotal: n(u.bytesTotal), rowCount: n(u.rowCount) })),
    trend: dbTrend.map((d) => ({ date: d.date.toISOString().slice(0, 10), bytesTotal: n(d.bytesTotal) })),
  });
}));

// ─── POST /api/admin/storage/snapshot ─────────────────────────────────────────
// Take a storage snapshot on demand (otherwise the daily scheduler does it).
adminRouter.post("/storage/snapshot", asyncHandler(async (_req: AuthRequest, res) => {
  const rows = await snapshotStorage();
  res.json({ rows });
}));

// ─── GET /api/admin/jobs ──────────────────────────────────────────────────────
// Filterable job-pool explorer: browse the actual JobPosting rows with their source,
// per-job acquisition + embedding cost, on-disk size, and best match score.
adminRouter.get("/jobs", asyncHandler(async (req: AuthRequest, res) => {
  const q = req.query as Record<string, string | undefined>;
  const page = Math.max(1, Number(q["page"]) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q["pageSize"]) || 25));
  const status = q["status"] || "active"; // active | all
  const sortKey = ["firstSeenAt", "acquisitionCostUsd", "company", "postedAt"].includes(q["sort"] ?? "")
    ? (q["sort"] as string) : "firstSeenAt";
  const order = q["order"] === "asc" ? "asc" : "desc";

  const where: Prisma.JobPostingWhereInput = {};
  if (status !== "all") where.postingStatus = status;
  if (q["source"]) where.sourceName = q["source"];
  if (q["remoteType"]) where.remoteType = q["remoteType"];
  if (q["seniority"]) where.seniority = q["seniority"];
  if (q["company"]) where.company = { contains: q["company"], mode: "insensitive" };
  if (q["q"]) where.title = { contains: q["q"], mode: "insensitive" };
  if (q["freshnessDays"]) {
    const fd = Number(q["freshnessDays"]);
    if (Number.isFinite(fd) && fd > 0) where.firstSeenAt = { gte: new Date(Date.now() - fd * 86_400_000) };
  }

  const [total, rows] = await Promise.all([
    prisma.jobPosting.count({ where }),
    prisma.jobPosting.findMany({
      where,
      orderBy: { [sortKey]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true, title: true, company: true, location: true, sourceName: true, remoteType: true,
        seniority: true, employmentType: true, postingStatus: true, postedAt: true, firstSeenAt: true,
        acquisitionCostUsd: true, embedCostUsd: true, sourceCount: true,
      },
    }),
  ]);

  const ids = rows.map((r) => r.id);
  // Per-row size + best match are fetched only for the current page (cheap).
  const [sizes, matches] = ids.length
    ? await Promise.all([
        prisma.$queryRaw<{ id: string; bytes: bigint }[]>`
          SELECT "id",
            (COALESCE(pg_column_size("description"), 0) + COALESCE(pg_column_size("descriptionClean"), 0)
             + COALESCE(pg_column_size("rawJson"), 0) + COALESCE(pg_column_size("embedding"), 0))::bigint AS bytes
          FROM "JobPosting" WHERE "id" IN (${Prisma.join(ids)})`,
        prisma.$queryRaw<{ pid: string; matches: number; best: number }[]>`
          SELECT j."postingId" AS pid, COUNT(m.id)::int AS matches, COALESCE(MAX(m."score"), 0)::int AS best
          FROM "Job" j JOIN "JobMatch" m ON m."jobId" = j.id
          WHERE j."postingId" IN (${Prisma.join(ids)}) GROUP BY j."postingId"`,
      ])
    : [[], []];
  const sizeBy = new Map(sizes.map((s) => [s.id, Number(s.bytes)]));
  const matchBy = new Map(matches.map((m) => [m.pid, { matches: Number(m.matches), best: Number(m.best) }]));

  res.json({
    page, pageSize, total, totalPages: Math.ceil(total / pageSize),
    jobs: rows.map((r) => {
      const acq = r.acquisitionCostUsd ?? null;
      const emb = r.embedCostUsd ?? null;
      const totalCost = acq != null || emb != null ? Number(((acq ?? 0) + (emb ?? 0)).toFixed(4)) : null;
      return {
        id: r.id, title: r.title, company: r.company, location: r.location, sourceName: r.sourceName,
        remoteType: r.remoteType, seniority: r.seniority, employmentType: r.employmentType,
        postingStatus: r.postingStatus, postedAt: r.postedAt?.toISOString() ?? null,
        firstSeenAt: r.firstSeenAt.toISOString(), sourceCount: r.sourceCount,
        acquisitionCostUsd: acq, embedCostUsd: emb, totalCostUsd: totalCost,
        sizeBytes: sizeBy.get(r.id) ?? 0,
        matchCount: matchBy.get(r.id)?.matches ?? 0,
        bestScore: matchBy.get(r.id)?.best ?? null,
      };
    }),
  });
}));

// ─── GET /api/admin/jobs/:id ──────────────────────────────────────────────────
// Single-posting detail: full record, cost + size breakdown, acquiring run, matches.
adminRouter.get("/jobs/:id", asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const posting = await prisma.jobPosting.findUnique({ where: { id } });
  if (!posting) throw badRequest("Posting not found");

  const [sizeRow, matchRows, run] = await Promise.all([
    prisma.$queryRaw<{ bytes: bigint; raw: bigint; emb: bigint }[]>`
      SELECT (COALESCE(pg_column_size("description"), 0) + COALESCE(pg_column_size("descriptionClean"), 0)
              + COALESCE(pg_column_size("rawJson"), 0) + COALESCE(pg_column_size("embedding"), 0))::bigint AS bytes,
             COALESCE(pg_column_size("rawJson"), 0)::bigint AS raw,
             COALESCE(pg_column_size("embedding"), 0)::bigint AS emb
      FROM "JobPosting" WHERE "id" = ${id}`,
    prisma.$queryRaw<{ score: number; tier: string | null; userId: string }[]>`
      SELECT m."score"::int AS score, m."statusTier" AS tier, m."userId"
      FROM "Job" j JOIN "JobMatch" m ON m."jobId" = j.id
      WHERE j."postingId" = ${id} ORDER BY m."score" DESC LIMIT 25`,
    posting.ingestRunId ? prisma.globalIngestRun.findUnique({ where: { id: posting.ingestRunId } }) : Promise.resolve(null),
  ]);
  const sz = sizeRow[0];

  res.json({
    posting: {
      id: posting.id, title: posting.title, company: posting.company, companyDomain: posting.companyDomain,
      location: posting.location, remoteType: posting.remoteType, seniority: posting.seniority,
      employmentType: posting.employmentType, sourceName: posting.sourceName, atsPlatform: posting.atsPlatform,
      jobUrl: posting.jobUrl, applyUrl: posting.applyUrl, postingStatus: posting.postingStatus,
      postedAt: posting.postedAt?.toISOString() ?? null, firstSeenAt: posting.firstSeenAt.toISOString(),
      lastSeenAt: posting.lastSeenAt.toISOString(), sourceCount: posting.sourceCount,
      salaryMin: posting.salaryMin, salaryMax: posting.salaryMax, salaryCurrency: posting.salaryCurrency,
      skills: posting.skillsJson, description: (posting.descriptionClean ?? posting.description ?? "").slice(0, 4000),
      embeddedAt: posting.embeddedAt?.toISOString() ?? null, embedModel: posting.embedModel,
    },
    cost: {
      acquisitionCostUsd: posting.acquisitionCostUsd,
      embedCostUsd: posting.embedCostUsd,
      totalCostUsd: posting.acquisitionCostUsd != null || posting.embedCostUsd != null
        ? Number(((posting.acquisitionCostUsd ?? 0) + (posting.embedCostUsd ?? 0)).toFixed(4)) : null,
    },
    size: { totalBytes: sz ? Number(sz.bytes) : 0, rawJsonBytes: sz ? Number(sz.raw) : 0, embeddingBytes: sz ? Number(sz.emb) : 0 },
    acquiredByRun: run ? { id: run.id, sourceTag: run.sourceTag, startedAt: run.startedAt?.toISOString() ?? null } : null,
    matches: matchRows.map((m) => ({ score: m.score, tier: m.tier, userId: m.userId })),
  });
}));
