import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { prisma } from "../lib/db.js";

export const statsRouter = Router();

statsRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;

  {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [
      jobsFoundToday,
      shortlisted,
      applied,
      needsApproval,
      weeklyTotal,
      recentApplications,
      aiCostToday,
      subscription,
    ] = await Promise.all([
      // Jobs matched today (all decisions)
      prisma.jobMatch.count({
        where: { userId, createdAt: { gte: todayStart } },
      }),
      // Jobs currently shortlisted
      prisma.jobMatch.count({
        where: { userId, decision: "SHORTLIST" },
      }),
      // Applications with APPLIED status
      prisma.application.count({
        where: { userId, status: "APPLIED" },
      }),
      // Applications needing review
      prisma.application.count({
        where: { userId, status: "NEEDS_APPROVAL" },
      }),
      // Jobs the user actually applied to this week (not just pipeline-created)
      prisma.application.count({
        where: { userId, status: "APPLIED", appliedAt: { gte: weekStart } },
      }),
      // Last 5 applications with match score
      prisma.application.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          company: true,
          roleTitle: true,
          matchScore: true,
          status: true,
          atsPlatform: true,
          createdAt: true,
        },
      }),
      // AI cost today
      prisma.aIUsageEvent.aggregate({
        where: { userId, createdAt: { gte: todayStart } },
        _sum: { estimatedCostUsd: true },
      }),
      // Current subscription
      prisma.subscription.findUnique({
        where: { userId },
        include: { plan: true },
      }),
    ]);

    // Calculate match rate: avg score of shortlisted jobs
    const shortlistScores = await prisma.jobMatch.findMany({
      where: { userId, decision: "SHORTLIST" },
      select: { score: true },
    });
    const matchRate = shortlistScores.length
      ? Math.round(shortlistScores.reduce((s, j) => s + j.score, 0) / shortlistScores.length)
      : 0;

    res.json({
      jobsFoundToday,
      shortlisted,
      applied,
      needsApproval,
      weeklyTotal,
      matchRate,
      tokenCostToday: aiCostToday._sum.estimatedCostUsd ?? 0,
      plan: subscription
        ? {
            name: subscription.plan.name,
            limit: subscription.plan.applicationsPerMonth,
            used: applied,
            periodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
          }
        : { name: "Free", limit: 5, used: applied, periodEnd: null },
      recentApplications: recentApplications.map((a) => ({
        ...a,
        createdAt: a.createdAt.toISOString(),
      })),
    });
  }
}));
