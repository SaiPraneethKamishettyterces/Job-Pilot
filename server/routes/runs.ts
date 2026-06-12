import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const runsRouter = Router();

// In-memory for dev
const runs = new Map<string, object>();

runsRouter.post("/start", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const runId = `run_${Date.now()}`;
  const run = {
    id: runId,
    userId,
    status: "DISCOVERING_JOBS",
    jobsDiscovered: 0,
    jobsShortlisted: 0,
    applicationsTotal: 0,
    applicationsDone: 0,
    startedAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  runs.set(runId, run);
  logger.info({ userId, runId }, "Run started");

  res.json({ message: "Run started", run });
});

runsRouter.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const userRuns = [...runs.values()].filter((r: any) => r.userId === userId);
  res.json({ runs: userRuns });
});

runsRouter.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const paramId = Array.isArray(req.params["id"]) ? req.params["id"][0] : req.params["id"];
  const run = runs.get(paramId ?? "");
  if (!run) { res.status(404).json({ message: "Run not found" }); return; }
  res.json(run);
});
