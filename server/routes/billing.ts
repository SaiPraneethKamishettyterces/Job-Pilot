import { Router } from "express";
import { asyncHandler } from "../lib/async-handler.js";
import { prisma } from "../lib/db.js";
import { config } from "../lib/config.js";

export const billingRouter = Router();

const round2 = (n: number) => parseFloat(n.toFixed(2));

function dateRanges() {
  const now = new Date();
  return {
    todayStart: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    weekStart: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
    monthStart: new Date(now.getFullYear(), now.getMonth(), 1),
    thirtyDaysAgo: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
  };
}

// Feature name → pipeline step label
const FEATURE_TO_STEP: Record<string, string> = {
  job_parsing: "scraping",
  job_discovery: "scraping",
  job_scoring: "scoring",
  match_scoring: "scoring",
  cover_letter_generation: "tailoring",
  resume_tailoring: "tailoring",
  ats_form_submission: "applying",
  job_applying: "applying",
  queue_management: "queuing",
};

// ─── GET /api/billing/company ─────────────────────────────────────────────────
// Company-wide executive cost metrics sourced from PostgreSQL (AIUsageEvent).
// Scope: Claude AI spend + platform usage only. Cloud/infra cost reporting
// belongs to the separate data-platform product, not this app-tier service.
billingRouter.get("/company", asyncHandler(async (_req, res) => {
  const { todayStart, weekStart, monthStart, thirtyDaysAgo } = dateRanges();

  {
    const [
      aiTotals,
      aiMonth,
      aiWeek,
      aiToday,
      byFeature,
      byModel,
      events30d,
      totalUsers,
      activeUsersMonth,
      totalApplications,
      appliedCount,
      applicationsByStatus,
      totalRuns,
      completedRuns,
    ] = await Promise.all([
      prisma.aIUsageEvent.aggregate({
        _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true, cacheReadTokens: true },
      }),
      prisma.aIUsageEvent.aggregate({
        where: { createdAt: { gte: monthStart } },
        _sum: { estimatedCostUsd: true },
      }),
      prisma.aIUsageEvent.aggregate({
        where: { createdAt: { gte: weekStart } },
        _sum: { estimatedCostUsd: true },
      }),
      prisma.aIUsageEvent.aggregate({
        where: { createdAt: { gte: todayStart } },
        _sum: { estimatedCostUsd: true },
      }),
      prisma.aIUsageEvent.groupBy({
        by: ["featureName"],
        _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
        _count: { id: true },
        orderBy: { _sum: { estimatedCostUsd: "desc" } },
      }),
      prisma.aIUsageEvent.groupBy({
        by: ["model"],
        _sum: { estimatedCostUsd: true, inputTokens: true, outputTokens: true },
        _count: { id: true },
        orderBy: { _sum: { estimatedCostUsd: "desc" } },
      }),
      prisma.aIUsageEvent.findMany({
        where: { createdAt: { gte: thirtyDaysAgo } },
        select: { createdAt: true, estimatedCostUsd: true },
      }),
      prisma.user.count(),
      prisma.user.count({
        where: { usageEvents: { some: { createdAt: { gte: monthStart } } } },
      }),
      prisma.application.count(),
      prisma.application.count({ where: { status: "APPLIED" } }),
      prisma.application.groupBy({ by: ["status"], _count: { id: true } }),
      prisma.applicationRun.count(),
      prisma.applicationRun.count({ where: { status: "COMPLETED" } }),
    ]);

    // Aggregate daily cost trend
    const dailyMap: Record<string, number> = {};
    for (const e of events30d) {
      const day = e.createdAt.toISOString().slice(0, 10);
      dailyMap[day] = (dailyMap[day] ?? 0) + e.estimatedCostUsd;
    }
    const daily30Days = Object.entries(dailyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, cost]) => ({ date, cost: parseFloat(cost.toFixed(4)) }));

    // Roll up features → pipeline steps
    const stepMap: Record<string, { step: string; cost: number; calls: number }> = {};
    for (const f of byFeature) {
      const step = FEATURE_TO_STEP[f.featureName] ?? "other";
      if (!stepMap[step]) stepMap[step] = { step, cost: 0, calls: 0 };
      stepMap[step].cost += f._sum.estimatedCostUsd ?? 0;
      stepMap[step].calls += f._count.id;
    }
    const byStep = Object.values(stepMap).map((s) => ({
      ...s,
      cost: parseFloat(s.cost.toFixed(4)),
    }));

    const totalCost = aiTotals._sum.estimatedCostUsd ?? 0;

    res.json({
      aiCosts: {
        totalAllTime: parseFloat(totalCost.toFixed(4)),
        thisMonth: parseFloat((aiMonth._sum.estimatedCostUsd ?? 0).toFixed(4)),
        thisWeek: parseFloat((aiWeek._sum.estimatedCostUsd ?? 0).toFixed(4)),
        today: parseFloat((aiToday._sum.estimatedCostUsd ?? 0).toFixed(4)),
        tokens: {
          totalInput: aiTotals._sum.inputTokens ?? 0,
          totalOutput: aiTotals._sum.outputTokens ?? 0,
          totalCacheRead: aiTotals._sum.cacheReadTokens ?? 0,
        },
        byFeature: byFeature.map((f) => ({
          featureName: f.featureName,
          step: FEATURE_TO_STEP[f.featureName] ?? "other",
          cost: parseFloat((f._sum.estimatedCostUsd ?? 0).toFixed(4)),
          inputTokens: f._sum.inputTokens ?? 0,
          outputTokens: f._sum.outputTokens ?? 0,
          calls: f._count.id,
        })),
        byStep,
        byModel: byModel.map((m) => ({
          model: m.model,
          cost: parseFloat((m._sum.estimatedCostUsd ?? 0).toFixed(4)),
          inputTokens: m._sum.inputTokens ?? 0,
          outputTokens: m._sum.outputTokens ?? 0,
          calls: m._count.id,
        })),
        daily30Days,
      },
      usage: {
        totalUsers,
        activeUsersThisMonth: activeUsersMonth,
        totalApplications,
        appliedCount,
        applicationsByStatus: applicationsByStatus.map((s) => ({
          status: s.status,
          count: s._count.id,
        })),
        totalRuns,
        completedRuns,
        avgCostPerUser: totalUsers > 0 ? parseFloat((totalCost / totalUsers).toFixed(4)) : 0,
        avgCostPerApplication:
          totalApplications > 0 ? parseFloat((totalCost / totalApplications).toFixed(4)) : 0,
      },
    });
  }
}));

// ─── GET /api/billing/financials ──────────────────────────────────────────────
// Company financials: MRR/ARR by tier, costs (AI + infra estimate), gross margin,
// and per-user economics. Revenue from active subscriptions; AI cost from
// AIUsageEvent; infra from the configured monthly estimate (INFRA_MONTHLY_USD).
billingRouter.get("/financials", asyncHandler(async (_req, res) => {
  const { monthStart } = dateRanges();
  const [activeSubs, aiMonth, aiAllTime] = await Promise.all([
    prisma.subscription.findMany({ where: { status: "active" }, include: { plan: true } }),
    prisma.aIUsageEvent.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { estimatedCostUsd: true } }),
    prisma.aIUsageEvent.aggregate({ _sum: { estimatedCostUsd: true } }),
  ]);

  const activeSubscribers = activeSubs.length;
  const mrr = activeSubs.reduce((s, sub) => s + (sub.plan?.priceMonthly ?? 0), 0);

  const planMap: Record<string, { plan: string; priceMonthly: number; subscribers: number; mrr: number }> = {};
  for (const sub of activeSubs) {
    const name = sub.plan?.name ?? "Unknown";
    if (!planMap[name]) planMap[name] = { plan: name, priceMonthly: sub.plan?.priceMonthly ?? 0, subscribers: 0, mrr: 0 };
    planMap[name].subscribers += 1;
    planMap[name].mrr += sub.plan?.priceMonthly ?? 0;
  }

  const aiCostThisMonth = aiMonth._sum.estimatedCostUsd ?? 0;
  const infraMonthly = config.billing.infraMonthlyUsd;
  const totalCostThisMonth = aiCostThisMonth + infraMonthly;
  const grossProfit = mrr - totalCostThisMonth;

  res.json({
    revenue: { mrr: round2(mrr), arr: round2(mrr * 12), activeSubscribers },
    byPlan: Object.values(planMap).map((p) => ({ ...p, mrr: round2(p.mrr) })),
    costs: {
      aiThisMonth: round2(aiCostThisMonth),
      aiAllTime: round2(aiAllTime._sum.estimatedCostUsd ?? 0),
      infraMonthly: round2(infraMonthly),
      totalThisMonth: round2(totalCostThisMonth),
    },
    margin: {
      grossProfit: round2(grossProfit),
      marginPct: mrr > 0 ? round2((grossProfit / mrr) * 100) : 0,
    },
    perUser: {
      arpu: activeSubscribers > 0 ? round2(mrr / activeSubscribers) : 0,
      aiCostPerActiveUser: activeSubscribers > 0 ? round2(aiCostThisMonth / activeSubscribers) : 0,
      totalCostPerActiveUser: activeSubscribers > 0 ? round2(totalCostThisMonth / activeSubscribers) : 0,
    },
  });
}));

// ─── GET /api/billing/users ───────────────────────────────────────────────────
// Per-user billing breakdown: plan, AI costs, tokens, applications, runs.
billingRouter.get("/users", asyncHandler(async (_req, res) => {
  const { monthStart } = dateRanges();

  {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        subscription: { include: { plan: true } },
        usageEvents: {
          select: {
            featureName: true,
            model: true,
            inputTokens: true,
            outputTokens: true,
            cacheReadTokens: true,
            estimatedCostUsd: true,
            createdAt: true,
          },
        },
        applications: { select: { status: true } },
        runs: { select: { status: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const result = users.map((u) => {
      const totalCost = u.usageEvents.reduce((s, e) => s + e.estimatedCostUsd, 0);
      const monthCost = u.usageEvents
        .filter((e) => e.createdAt >= monthStart)
        .reduce((s, e) => s + e.estimatedCostUsd, 0);

      const byFeatureMap: Record<string, { featureName: string; step: string; cost: number; calls: number }> = {};
      for (const e of u.usageEvents) {
        if (!byFeatureMap[e.featureName]) {
          byFeatureMap[e.featureName] = {
            featureName: e.featureName,
            step: FEATURE_TO_STEP[e.featureName] ?? "other",
            cost: 0,
            calls: 0,
          };
        }
        byFeatureMap[e.featureName].cost += e.estimatedCostUsd;
        byFeatureMap[e.featureName].calls += 1;
      }

      return {
        userId: u.id,
        email: u.email,
        name: u.name,
        createdAt: u.createdAt.toISOString(),
        plan: u.subscription
          ? {
              name: u.subscription.plan.name,
              priceMonthly: u.subscription.plan.priceMonthly,
              applicationsPerMonth: u.subscription.plan.applicationsPerMonth,
              status: u.subscription.status,
              periodEnd: u.subscription.currentPeriodEnd?.toISOString() ?? null,
            }
          : { name: "Free", priceMonthly: 0, applicationsPerMonth: 5, status: "active", periodEnd: null },
        aiCost: {
          total: parseFloat(totalCost.toFixed(4)),
          thisMonth: parseFloat(monthCost.toFixed(4)),
          byFeature: Object.values(byFeatureMap).map((f) => ({
            ...f,
            cost: parseFloat(f.cost.toFixed(4)),
          })),
        },
        tokens: {
          totalInput: u.usageEvents.reduce((s, e) => s + e.inputTokens, 0),
          totalOutput: u.usageEvents.reduce((s, e) => s + e.outputTokens, 0),
          totalCacheRead: u.usageEvents.reduce((s, e) => s + e.cacheReadTokens, 0),
          totalEvents: u.usageEvents.length,
        },
        applications: {
          total: u.applications.length,
          applied: u.applications.filter((a) => a.status === "APPLIED").length,
        },
        runs: {
          total: u.runs.length,
          completed: u.runs.filter((r) => r.status === "COMPLETED").length,
        },
      };
    });

    res.json({ users: result, total: result.length });
  }
}));
