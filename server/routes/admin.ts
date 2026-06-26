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
import { PRICE_PER_MTOK, FALLBACK_PRICE } from "../services/ai/model-config.js";

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

// ─── GET /api/admin/claude-usage ──────────────────────────────────────────────
// Everything the owner needs to understand Claude API spend. Truthful by design:
//   • Claude is called in exactly ONE place — resume tailoring (model-config TASK_MODEL).
//     Every other AI feature routes to the local/compat model ($0). The per-feature
//     table shows this directly (provider = anthropic vs local).
//   • Resume tailoring is a SINGLE Claude call (resume + ATS analysis in one response),
//     so there is no per-substep API charge. The "section breakdown" is an ESTIMATE:
//     the one call's OUTPUT cost split by each rendered section's token share. Input
//     (prompt/context) cost is shared and reported separately, never split per section.
const isClaude = (model: string) => model.toLowerCase().startsWith("claude");
const priceFor = (model: string) => PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
// chars→tokens: ~4 chars/token is the standard rough heuristic. Only used to split
// one real output cost across sections proportionally, so the constant cancels out.
const approxTokens = (s: string) => Math.ceil(s.length / 4);

function classifySection(header: string): string {
  const h = header.toLowerCase();
  if (/summary|objective|profile/.test(h)) return "Professional Summary";
  if (/skill|technolog|competenc/.test(h)) return "Technical Skills";
  if (/experience|employ|work history/.test(h)) return "Experience";
  if (/education|academ/.test(h)) return "Education";
  if (/project/.test(h)) return "Projects";
  if (/certif|award|publication/.test(h)) return "Certifications & Awards";
  return "Header & Contact";
}

adminRouter.get("/claude-usage", asyncHandler(async (req: AuthRequest, res) => {
  const days = Math.min(180, Math.max(1, Number(req.query["days"]) || 30));
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [events, resumeDocs, recentRows, monthAgg, plans, settings] = await Promise.all([
    prisma.aIUsageEvent.findMany({
      where: { createdAt: { gte: since } },
      select: {
        userId: true, featureName: true, model: true, inputTokens: true, outputTokens: true,
        cacheReadTokens: true, estimatedCostUsd: true, applicationId: true, createdAt: true, breakdownJson: true,
      },
      orderBy: { createdAt: "desc" },
    }),
    // Rendered resumes back the section-share estimate. Cap to keep it cheap.
    prisma.applicationDocument.findMany({
      where: { type: "resume", createdAt: { gte: since } },
      select: { content: true },
      take: 300,
      orderBy: { createdAt: "desc" },
    }),
    // Recent Claude calls joined to the application + job (for a useful table).
    prisma.aIUsageEvent.findMany({
      where: { createdAt: { gte: since }, model: { startsWith: "claude" } },
      select: {
        createdAt: true, model: true, inputTokens: true, outputTokens: true,
        cacheReadTokens: true, estimatedCostUsd: true, applicationId: true,
        application: { select: { status: true, job: { select: { title: true, company: true } } } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    // Month-to-date Claude spend (for the monthly budget gauge).
    prisma.aIUsageEvent.aggregate({
      _sum: { estimatedCostUsd: true },
      where: { createdAt: { gte: monthStart }, model: { startsWith: "claude" } },
    }),
    prisma.plan.findMany({
      where: { isActive: true },
      select: { slug: true, name: true, priceMonthly: true, applicationsPerMonth: true },
      orderBy: { priceMonthly: "asc" },
    }),
    getRuntimeSettings(),
  ]);

  // Reconciliation against the real Anthropic bill (imported CSV). The tracked
  // estimate only covers THIS app's API key; the bill may include other keys.
  const reconRow = await prisma.adminSetting.findUnique({ where: { key: "claudeActualUsage" } });
  let reconciliation: unknown = null;
  if (reconRow) { try { reconciliation = JSON.parse(reconRow.value); } catch { /* ignore */ } }

  // ── Per-feature roll-up (where is the AI — and Claude specifically — used) ──
  const featMap = new Map<string, {
    featureName: string; model: string; calls: number;
    inputTokens: number; outputTokens: number; cacheReadTokens: number; costUsd: number;
  }>();
  for (const e of events) {
    const key = `${e.featureName}::${e.model}`;
    const cur = featMap.get(key) ?? {
      featureName: e.featureName, model: e.model, calls: 0,
      inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, costUsd: 0,
    };
    cur.calls += 1;
    cur.inputTokens += e.inputTokens;
    cur.outputTokens += e.outputTokens;
    cur.cacheReadTokens += e.cacheReadTokens;
    cur.costUsd += e.estimatedCostUsd;
    featMap.set(key, cur);
  }
  const perFeature = [...featMap.values()]
    .map((f) => ({
      ...f,
      costUsd: Number(f.costUsd.toFixed(6)),
      avgCostUsd: Number((f.costUsd / Math.max(1, f.calls)).toFixed(6)),
      provider: isClaude(f.model) ? "anthropic" : "local",
      isClaude: isClaude(f.model),
    }))
    .sort((a, b) => b.costUsd - a.costUsd);

  // ── Totals ──
  const claudeEvents = events.filter((e) => isClaude(e.model));
  const claudeCostUsd = claudeEvents.reduce((s, e) => s + e.estimatedCostUsd, 0);
  const apps = new Set(events.map((e) => e.applicationId).filter(Boolean));
  const claudeApps = new Set(claudeEvents.map((e) => e.applicationId).filter(Boolean));

  // ── Resume tailoring deep-dive (the ONLY Claude feature) ──
  const resumeClaude = claudeEvents.filter((e) => e.featureName === "resume_tailoring");
  let inputCostUsd = 0;
  let outputCostUsd = 0;
  for (const e of resumeClaude) {
    const p = priceFor(e.model);
    const billedInput = e.inputTokens - e.cacheReadTokens;
    inputCostUsd += (billedInput * p.input + e.cacheReadTokens * p.input * 0.1) / 1_000_000;
    outputCostUsd += (e.outputTokens * p.output) / 1_000_000;
  }
  const perCallCosts = resumeClaude.map((e) => e.estimatedCostUsd);
  const resumeStats = {
    calls: resumeClaude.length,
    avgCostUsd: Number((perCallCosts.reduce((s, c) => s + c, 0) / Math.max(1, perCallCosts.length)).toFixed(6)),
    minCostUsd: perCallCosts.length ? Number(Math.min(...perCallCosts).toFixed(6)) : 0,
    maxCostUsd: perCallCosts.length ? Number(Math.max(...perCallCosts).toFixed(6)) : 0,
    avgInputTokens: Math.round(resumeClaude.reduce((s, e) => s + e.inputTokens, 0) / Math.max(1, resumeClaude.length)),
    avgOutputTokens: Math.round(resumeClaude.reduce((s, e) => s + e.outputTokens, 0) / Math.max(1, resumeClaude.length)),
    inputCostUsd: Number(inputCostUsd.toFixed(6)),
    outputCostUsd: Number(outputCostUsd.toFixed(6)),
  };

  // ── Section share estimate (split the single output cost by rendered token share) ──
  const sectionTokens = new Map<string, number>();
  for (const doc of resumeDocs) {
    if (!doc.content) continue;
    // Split markdown on H2 headers ("## SECTION"). Everything before the first
    // header is contact/name → "Header & Contact".
    const parts = doc.content.split(/^##\s+/m);
    const lead = parts.shift() ?? "";
    if (lead.trim()) sectionTokens.set("Header & Contact", (sectionTokens.get("Header & Contact") ?? 0) + approxTokens(lead));
    for (const part of parts) {
      const nl = part.indexOf("\n");
      const header = nl === -1 ? part : part.slice(0, nl);
      const bucket = classifySection(header);
      sectionTokens.set(bucket, (sectionTokens.get(bucket) ?? 0) + approxTokens(part));
    }
  }
  const totalSectionTokens = [...sectionTokens.values()].reduce((s, t) => s + t, 0) || 1;
  const sectionShares = [...sectionTokens.entries()]
    .map(([section, toks]) => {
      const pct = toks / totalSectionTokens;
      return {
        section,
        pct: Number((pct * 100).toFixed(1)),
        estCostUsd: Number((pct * resumeStats.outputCostUsd).toFixed(6)),
      };
    })
    .sort((a, b) => b.pct - a.pct);

  // ── MEASURED cost factors (from per-call breakdownJson) — input & output drill-down ──
  const prResume = priceFor(resumeClaude[0]?.model ?? "claude-sonnet-4-6");
  const inAgg = new Map<string, number>();
  const outAgg = new Map<string, number>();
  let breakdownCalls = 0;
  for (const e of resumeClaude) {
    const b = e.breakdownJson as { input?: Record<string, number>; output?: Record<string, number> } | null;
    if (!b || (!b.input && !b.output)) continue;
    breakdownCalls++;
    for (const [k, v] of Object.entries(b.input ?? {})) inAgg.set(k, (inAgg.get(k) ?? 0) + (Number(v) || 0));
    for (const [k, v] of Object.entries(b.output ?? {})) outAgg.set(k, (outAgg.get(k) ?? 0) + (Number(v) || 0));
  }
  const factorList = (agg: Map<string, number>, pricePerMtok: number) => {
    const total = [...agg.values()].reduce((s, t) => s + t, 0) || 1;
    return [...agg.entries()]
      .map(([factor, tokens]) => ({
        factor,
        tokens,
        avgTokens: Math.round(tokens / Math.max(1, breakdownCalls)),
        costUsd: Number(((tokens * pricePerMtok) / 1_000_000).toFixed(6)),
        pct: Number(((tokens / total) * 100).toFixed(1)),
      }))
      .sort((a, b) => b.tokens - a.tokens);
  };
  const costFactors = {
    measuredCalls: breakdownCalls,
    input: factorList(inAgg, prResume.input),
    output: factorList(outAgg, prResume.output),
  };

  // ── Spend per user (who is driving Claude cost) ──
  const userAgg = new Map<string, { costUsd: number; calls: number }>();
  for (const e of claudeEvents) {
    const cur = userAgg.get(e.userId) ?? { costUsd: 0, calls: 0 };
    cur.costUsd += e.estimatedCostUsd;
    cur.calls += 1;
    userAgg.set(e.userId, cur);
  }
  const userRows = await prisma.user.findMany({
    where: { id: { in: [...userAgg.keys()] } },
    select: { id: true, name: true, email: true },
  });
  const userName = new Map(userRows.map((u) => [u.id, u.name || u.email || u.id.slice(0, 8)]));
  const spendPerUser = [...userAgg.entries()]
    .map(([userId, v]) => ({
      userId,
      name: userName.get(userId) ?? userId.slice(0, 8),
      costUsd: Number(v.costUsd.toFixed(6)),
      calls: v.calls,
      avgCostUsd: Number((v.costUsd / Math.max(1, v.calls)).toFixed(6)),
    }))
    .sort((a, b) => b.costUsd - a.costUsd)
    .slice(0, 20);

  // ── Daily trend (Claude cost + calls) ──
  const trendMap = new Map<string, { costUsd: number; calls: number }>();
  for (const e of claudeEvents) {
    const key = e.createdAt.toISOString().slice(0, 10);
    const cur = trendMap.get(key) ?? { costUsd: 0, calls: 0 };
    cur.costUsd += e.estimatedCostUsd;
    cur.calls += 1;
    trendMap.set(key, cur);
  }
  let cum = 0;
  const trend = [...trendMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, v]) => {
      cum += v.costUsd;
      return { date, costUsd: Number(v.costUsd.toFixed(6)), calls: v.calls, cumulativeUsd: Number(cum.toFixed(6)) };
    });

  // ── Recent Claude calls (joined to job + status — a useful table, not a dump) ──
  const recent = recentRows.slice(0, 50).map((e) => ({
    createdAt: e.createdAt.toISOString(),
    jobTitle: e.application?.job?.title ?? null,
    company: e.application?.job?.company ?? null,
    status: e.application?.status ?? null,
    inputTokens: e.inputTokens,
    outputTokens: e.outputTokens,
    cacheReadTokens: e.cacheReadTokens,
    costUsd: Number(e.estimatedCostUsd.toFixed(6)),
    applicationId: e.applicationId,
  }));

  // ── Routing: what share of applications actually hit Claude vs the local model ──
  const appsTotal = apps.size;
  const claudeAppCount = claudeApps.size;
  const claudePct = appsTotal ? Number(((claudeAppCount / appsTotal) * 100).toFixed(1)) : 0;

  // ── Projection: at the current rate, what does a month of Claude cost? ──
  const resumesPerDay = resumeClaude.length / days;
  const projectedMonthlyUsd = Number((resumeStats.avgCostUsd * resumesPerDay * 30).toFixed(2));
  const blendedCostPerApp = appsTotal ? Number((claudeCostUsd / appsTotal).toFixed(6)) : 0;

  // ── Margin: cost per Claude resume vs plan revenue per application ──
  const margins = plans.map((pl) => {
    const revenuePerApp = pl.applicationsPerMonth > 0 ? pl.priceMonthly / pl.applicationsPerMonth : 0;
    const marginClaude = revenuePerApp - resumeStats.avgCostUsd;
    const marginBlended = revenuePerApp - blendedCostPerApp;
    return {
      slug: pl.slug,
      name: pl.name,
      priceMonthly: pl.priceMonthly,
      applicationsPerMonth: pl.applicationsPerMonth,
      revenuePerApp: Number(revenuePerApp.toFixed(6)),
      marginClaudeResume: Number(marginClaude.toFixed(6)),
      marginBlendedApp: Number(marginBlended.toFixed(6)),
      claudeResumeProfitable: marginClaude >= 0,
    };
  });

  // ── Budget gauges ──
  const monthToDateUsd = Number((monthAgg._sum.estimatedCostUsd ?? 0).toFixed(6));
  const budget = {
    monthlyBudgetUsd: settings.claudeMonthlyBudgetUsd,
    monthToDateUsd,
    monthPct: settings.claudeMonthlyBudgetUsd > 0
      ? Number(((monthToDateUsd / settings.claudeMonthlyBudgetUsd) * 100).toFixed(1)) : 0,
    projectedMonthlyUsd,
    costPerResumeWarnUsd: settings.claudeCostPerResumeWarnUsd,
    costPerResumeOverWarn: resumeStats.avgCostUsd >= settings.claudeCostPerResumeWarnUsd,
  };

  // ── Cost-optimization recommendations (computed from THIS data, all estimates) ──
  const totalCacheRead = resumeClaude.reduce((s, e) => s + e.cacheReadTokens, 0);
  const pr = priceFor(resumeClaude[0]?.model ?? "claude-sonnet-4-6");
  const recommendations: { id: string; title: string; detail: string; estSavingPerResumeUsd: number }[] = [];
  if (resumeClaude.length > 0 && totalCacheRead === 0) {
    // The skill system prompt is the stable, cacheable slice of input. Assume ~40%
    // of input is cacheable; cached reads bill at 10% → ~90% saved on that slice.
    const cacheableShare = 0.4;
    const saving = (resumeStats.avgInputTokens * cacheableShare * pr.input * 0.9) / 1_000_000;
    recommendations.push({
      id: "caching",
      title: "Prompt caching is inactive",
      detail: `0 cache-read tokens recorded. The ATS skill prompt is identical every call — caching it (~${Math.round(cacheableShare * 100)}% of ${Math.round(resumeStats.avgInputTokens / 100) / 10}k input) would bill at 10%.`,
      estSavingPerResumeUsd: Number(saving.toFixed(5)),
    });
  }
  if (resumeStats.avgOutputTokens > 3500) {
    const target = 3000;
    const saving = ((resumeStats.avgOutputTokens - target) * pr.output) / 1_000_000;
    recommendations.push({
      id: "output-length",
      title: "Output tokens drive most of the cost",
      detail: `Avg ${Math.round(resumeStats.avgOutputTokens / 100) / 10}k output tokens at $${pr.output}/1M. A tighter resume format targeting ~${target / 1000}k could cut output cost.`,
      estSavingPerResumeUsd: Number(saving.toFixed(5)),
    });
  }

  res.json({
    windowDays: days,
    pricing: {
      model: resumeClaude[0]?.model ?? "claude-sonnet-4-6",
      inputPerMtok: pr.input,
      outputPerMtok: pr.output,
      cacheReadMultiplier: 0.1,
      cacheCreationPriced: false, // token-tracker does not price cache-creation tokens
    },
    totals: {
      claudeCostUsd: Number(claudeCostUsd.toFixed(6)),
      claudeCalls: claudeEvents.length,
      totalAiCalls: events.length,
      localCalls: events.length - claudeEvents.length,
      appsTotal,
      appsWithClaude: claudeAppCount,
      claudePct,
      blendedCostPerApp,
    },
    budget,
    margins,
    recommendations,
    perFeature,
    resume: { ...resumeStats, sectionShares, sampleResumes: resumeDocs.length },
    costFactors,
    spendPerUser,
    trend,
    recent,
    reconciliation,
  });
}));

// POST /api/admin/claude-usage/reconcile — import the Anthropic billing CSV export so
// the dashboard shows the TRUE billed cost (all API keys) next to the app's tracked
// estimate (this app's key only). Parses the standard export columns and prices each
// row by model, including prompt-cache write/read multipliers.
const CACHE_WRITE_5M = 1.25, CACHE_WRITE_1H = 2.0, CACHE_READ = 0.1;
adminRouter.post("/claude-usage/reconcile", asyncHandler(async (req: AuthRequest, res) => {
  const csv = typeof req.body?.csv === "string" ? req.body.csv : "";
  if (!csv.trim()) throw badRequest("Paste the Anthropic usage CSV export.");

  const lines = csv.split(/\r?\n/).filter((l: string) => l.trim());
  if (lines.length < 2) throw badRequest("CSV has no data rows.");
  const header = lines[0].split(",").map((h: string) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iModel = idx("model_version"), iKey = idx("api_key"), iDate = idx("usage_date_utc");
  const iNoCache = idx("usage_input_tokens_no_cache");
  const iW5 = idx("usage_input_tokens_cache_write_5m"), iW1 = idx("usage_input_tokens_cache_write_1h");
  const iRead = idx("usage_input_tokens_cache_read"), iOut = idx("usage_output_tokens");
  if (iNoCache < 0 || iOut < 0 || iModel < 0) throw badRequest("Unrecognized CSV — missing token columns.");

  const num = (cells: string[], i: number) => (i >= 0 ? Number(cells[i]) || 0 : 0);
  let totalInput = 0, totalOutput = 0, actualBilledUsd = 0;
  let periodStart = "", periodEnd = "";
  const byKey = new Map<string, { costUsd: number; input: number; output: number }>();

  for (const line of lines.slice(1)) {
    const c = line.split(",");
    const model = (c[iModel] || "").trim();
    const p = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
    const noCache = num(c, iNoCache), w5 = num(c, iW5), w1 = num(c, iW1), read = num(c, iRead), out = num(c, iOut);
    const inputTok = noCache + w5 + w1 + read;
    const cost =
      (noCache * p.input + w5 * p.input * CACHE_WRITE_5M + w1 * p.input * CACHE_WRITE_1H +
        read * p.input * CACHE_READ + out * p.output) / 1_000_000;
    totalInput += inputTok; totalOutput += out; actualBilledUsd += cost;
    const key = (c[iKey] || "unknown").trim();
    const cur = byKey.get(key) ?? { costUsd: 0, input: 0, output: 0 };
    cur.costUsd += cost; cur.input += inputTok; cur.output += out;
    byKey.set(key, cur);
    const d = (c[iDate] || "").trim();
    if (d) { if (!periodStart || d < periodStart) periodStart = d; if (!periodEnd || d > periodEnd) periodEnd = d; }
  }

  const payload = {
    actualBilledUsd: Number(actualBilledUsd.toFixed(6)),
    totalInput, totalOutput,
    periodStart, periodEnd,
    importedAt: new Date().toISOString(),
    byKey: [...byKey.entries()]
      .map(([key, v]) => ({ key, costUsd: Number(v.costUsd.toFixed(6)), input: v.input, output: v.output }))
      .sort((a, b) => b.costUsd - a.costUsd),
  };
  await prisma.adminSetting.upsert({
    where: { key: "claudeActualUsage" },
    create: { key: "claudeActualUsage", value: JSON.stringify(payload) },
    update: { value: JSON.stringify(payload) },
  });
  logger.info({ actualBilledUsd: payload.actualBilledUsd, keys: payload.byKey.length }, "claude usage reconciled from CSV");
  res.json(payload);
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
