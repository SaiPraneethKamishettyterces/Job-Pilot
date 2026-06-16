import { prisma } from "../../lib/db.js";

// Plan-based usage limits. The active subscription's Plan defines the monthly
// application allowance; users with no subscription get a small free allowance.
// Enforcement happens at the funnel point that actually creates applications
// (the pipeline shortlist) and is surfaced to the UI via the subscription route.

const FREE_LIMITS = {
  planName: "Free",
  applicationsPerMonth: 5,
  tailoringsPerMonth: 5,
  automationEnabled: false,
};

export interface PlanLimits {
  planName: string;
  applicationsPerMonth: number;
  tailoringsPerMonth: number;
  automationEnabled: boolean;
}

export interface UsageSummary extends PlanLimits {
  applicationsUsed: number;
  applicationsRemaining: number;
  periodResetsAt: string; // ISO — start of next month
  active: boolean;
}

function monthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1);
}
function nextMonthStart(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 1);
}

/** Resolve the user's effective plan limits (subscribed plan, else free tier). */
export async function getPlanLimits(userId: string): Promise<PlanLimits> {
  const sub = await prisma.subscription.findUnique({ where: { userId }, include: { plan: true } });
  // Only an active subscription confers its plan's allowance.
  if (!sub || sub.status !== "active" || !sub.plan) return { ...FREE_LIMITS };
  return {
    planName: sub.plan.name,
    applicationsPerMonth: sub.plan.applicationsPerMonth,
    tailoringsPerMonth: sub.plan.tailoringsPerMonth,
    automationEnabled: sub.plan.automationEnabled,
  };
}

/** Applications created in the current calendar month (consumed quota). */
export async function countApplicationsThisMonth(userId: string): Promise<number> {
  return prisma.application.count({
    where: {
      userId,
      createdAt: { gte: monthStart() },
      // Declined/archived applications still consumed a generation slot.
    },
  });
}

/** Full usage summary for display + enforcement. */
export async function getUsageSummary(userId: string): Promise<UsageSummary> {
  const [limits, used] = await Promise.all([getPlanLimits(userId), countApplicationsThisMonth(userId)]);
  const remaining = Math.max(0, limits.applicationsPerMonth - used);
  const sub = await prisma.subscription.findUnique({ where: { userId } });
  return {
    ...limits,
    applicationsUsed: used,
    applicationsRemaining: remaining,
    periodResetsAt: nextMonthStart().toISOString(),
    active: sub?.status === "active",
  };
}

/** How many more applications the user may create this month (>= 0). */
export async function remainingApplications(userId: string): Promise<number> {
  const [limits, used] = await Promise.all([getPlanLimits(userId), countApplicationsThisMonth(userId)]);
  return Math.max(0, limits.applicationsPerMonth - used);
}
