import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { requireAdmin } from "../middleware/require-admin.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";
import { triggerGlobalIngestion } from "../services/ingestion/global-ingestor.js";

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
// scrapers). Returns immediately; progress shows up in GET /ingestion.
adminRouter.post("/ingestion/run", asyncHandler(async (_req: AuthRequest, res) => {
  triggerGlobalIngestion();
  logger.info("Admin triggered manual ingestion run");
  res.status(202).json({ message: "Ingestion started" });
}));
