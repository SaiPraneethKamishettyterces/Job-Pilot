import { api } from "./client.js";

export type DashboardStats = {
  jobsFoundToday: number;
  shortlisted: number;
  applied: number;
  needsApproval: number;
  weeklyTotal: number;
  matchRate: number;
  tokenCostToday: number;
  plan: {
    name: string;
    limit: number;
    used: number;
    periodEnd: string | null;
  };
  recentApplications: Array<{
    id: string;
    company: string;
    roleTitle: string;
    matchScore: number | null;
    status: string;
    atsPlatform: string | null;
    createdAt: string;
  }>;
};

export async function getDashboardStats(): Promise<DashboardStats> {
  const { data } = await api.get<DashboardStats>("/api/stats");
  return data;
}
