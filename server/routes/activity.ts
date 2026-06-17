import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { prisma } from "../lib/db.js";

export const activityRouter = Router();

// GET /api/activity — a unified audit/activity feed for the current user:
// per-application lifecycle events (generated, approved, submitted, retried…)
// plus subscription events, newest first.
activityRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const limit = Math.min(200, Math.max(1, parseInt(String(req.query["limit"] ?? "100"), 10) || 100));

  const [appEvents, subEvents] = await Promise.all([
    prisma.applicationEvent.findMany({
      where: { application: { userId } },
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { application: { select: { id: true, company: true, roleTitle: true } } },
    }),
    prisma.subscriptionEvent.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 25,
    }),
  ]);

  const events = [
    ...appEvents.map((e) => ({
      id: e.id,
      kind: "application" as const,
      type: e.type,
      description: e.description,
      company: e.application?.company ?? null,
      roleTitle: e.application?.roleTitle ?? null,
      applicationId: e.applicationId,
      createdAt: e.createdAt.toISOString(),
    })),
    ...subEvents.map((e) => ({
      id: e.id,
      kind: "subscription" as const,
      type: e.eventType,
      description: e.oldStatus && e.newStatus ? `${e.oldStatus} → ${e.newStatus}` : (e.planName ?? null),
      company: null,
      roleTitle: null,
      applicationId: null,
      createdAt: e.createdAt.toISOString(),
    })),
  ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  res.json({ events, total: events.length });
}));
