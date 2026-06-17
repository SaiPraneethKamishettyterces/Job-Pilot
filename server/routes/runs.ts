import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";
import { createIngestionRun } from "../services/ingestion/ingestion-orchestrator.js";
import { triggerFullPipeline } from "../workers/application-pipeline.js";

export const runsRouter = Router();

function serializeRun(r: {
  id: string;
  status: string;
  triggerType: string | null;
  jobsDiscovered: number;
  jobsInserted: number;
  duplicatesSkipped: number;
  jobsShortlisted: number;
  applicationsTotal: number;
  applicationsDone: number;
  errorMessage: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: r.id,
    status: r.status,
    triggerType: r.triggerType,
    jobsDiscovered: r.jobsDiscovered,
    jobsInserted: r.jobsInserted,
    duplicatesSkipped: r.duplicatesSkipped,
    jobsShortlisted: r.jobsShortlisted,
    applicationsTotal: r.applicationsTotal,
    applicationsDone: r.applicationsDone,
    errorMessage: r.errorMessage,
    startedAt: r.startedAt?.toISOString() ?? null,
    completedAt: r.completedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  };
}

// POST /api/runs/start — create a run and kick off the full pipeline:
// discover jobs → score matches → generate applications (resume, cover letter,
// answers, autofill package). Returns immediately; the run row updates as it
// progresses. Nothing is auto-submitted.
runsRouter.post("/start", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const run = await createIngestionRun(userId, "manual_test");
  triggerFullPipeline(run.id);
  logger.info({ userId, runId: run.id }, "Full application pipeline run started");
  res.status(202).json({ message: "Run started", run: serializeRun(run) });
}));

// GET /api/runs — list the current user's runs (newest first).
runsRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const runs = await prisma.applicationRun.findMany({
    where: { userId: req.userId! },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  res.json({ runs: runs.map(serializeRun), total: runs.length });
}));

// GET /api/runs/:id — status of a single run.
runsRouter.get("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const run = await prisma.applicationRun.findFirst({ where: { id, userId: req.userId! } });
  if (!run) throw notFound("Run not found");
  res.json(serializeRun(run));
}));
