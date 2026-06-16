import { api } from "./client.js";

export type BillingFeature = {
  featureName: string;
  step: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
};

export type BillingModel = {
  model: string;
  cost: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
};

export type BillingStep = { step: string; cost: number; calls: number };
export type DailyPoint = { date: string; cost: number };

export type CompanyBillingMetrics = {
  aiCosts: {
    totalAllTime: number;
    thisMonth: number;
    thisWeek: number;
    today: number;
    tokens: { totalInput: number; totalOutput: number; totalCacheRead: number };
    byFeature: BillingFeature[];
    byStep: BillingStep[];
    byModel: BillingModel[];
    daily30Days: DailyPoint[];
  };
  usage: {
    totalUsers: number;
    activeUsersThisMonth: number;
    totalApplications: number;
    appliedCount: number;
    applicationsByStatus: { status: string; count: number }[];
    totalRuns: number;
    completedRuns: number;
    avgCostPerUser: number;
    avgCostPerApplication: number;
  };
  cloud: {
    status: "not_connected";
    dataAvailableAt: string;
    backlogItems: string[];
  };
};

export type UserBillingRow = {
  userId: string;
  email: string;
  name: string | null;
  createdAt: string;
  plan: {
    name: string;
    priceMonthly: number;
    applicationsPerMonth: number;
    status: string;
    periodEnd: string | null;
  };
  aiCost: {
    total: number;
    thisMonth: number;
    byFeature: { featureName: string; step: string; cost: number; calls: number }[];
  };
  tokens: {
    totalInput: number;
    totalOutput: number;
    totalCacheRead: number;
    totalEvents: number;
  };
  applications: { total: number; applied: number };
  runs: { total: number; completed: number };
};

export type UserBillingResponse = { users: UserBillingRow[]; total: number };

export async function getCompanyBilling(): Promise<CompanyBillingMetrics> {
  const { data } = await api.get<CompanyBillingMetrics>("/api/billing/company");
  return data;
}

export async function getUserBilling(): Promise<UserBillingResponse> {
  const { data } = await api.get<UserBillingResponse>("/api/billing/users");
  return data;
}
