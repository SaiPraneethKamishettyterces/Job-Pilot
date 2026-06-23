import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";
import { createIngestionRun } from "../services/ingestion/ingestion-orchestrator.js";
import { triggerFullPipeline } from "../workers/application-pipeline.js";
import { triggerGlobalIngestion } from "../services/ingestion/global-ingestor.js";

export const ingestionRouter = Router();

function serializeRun(r: {
  id: string;
  status: string;
  triggerType: string | null;
  requestedSourcesJson: unknown;
  jobsDiscovered: number;
  jobsInserted: number;
  duplicatesSkipped: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    status: r.status,
    triggerType: r.triggerType,
    requestedSources: (r.requestedSourcesJson as string[]) ?? [],
    jobsDiscovered: r.jobsDiscovered,
    jobsInserted: r.jobsInserted,
    duplicatesSkipped: r.duplicatesSkipped,
    errorMessage: r.errorMessage,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// POST /api/ingestion/start — manually trigger an ingestion run (dev/test).
// Requires an active subscription, mirroring the production gate.
ingestionRouter.post("/start", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const sub = await prisma.subscription.findUnique({ where: { userId } });
  if (!sub || sub.status !== "active") {
    res.status(402).json({
      message: "Subscription is not active. Activate your subscription before running ingestion.",
      subscriptionStatus: sub?.status ?? "inactive",
    });
    return;
  }

  const run = await createIngestionRun(userId, "manual_test");
  // Two-stage match against the shared global pool, then generate applications.
  triggerFullPipeline(run.id);
  logger.info({ userId, runId: run.id }, "Manual run started (two-stage match)");
  res.status(202).json({ message: "Run started", run: serializeRun(run) });
}));

// POST /api/ingestion/global — refresh the shared global job pool (dev/test/admin).
// User-agnostic; normally driven by the daily scheduler. Returns immediately.
ingestionRouter.post("/global", requireAuth, asyncHandler(async (_req: AuthRequest, res) => {
  triggerGlobalIngestion();
  logger.info("Manual global pool refresh triggered");
  res.status(202).json({ message: "Global ingestion started" });
}));

// GET /api/ingestion — list the current user's ingestion runs (newest first).
ingestionRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const runs = await prisma.applicationRun.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ runs: runs.map(serializeRun), total: runs.length });
}));

// GET /api/ingestion/:runId — status of a single run.
ingestionRouter.get("/:runId", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const runId = req.params["runId"] as string;
  const run = await prisma.applicationRun.findFirst({
    where: { id: runId, userId: req.userId! },
  });
  if (!run) throw notFound("Run not found");
  res.json(serializeRun(run));
}));
