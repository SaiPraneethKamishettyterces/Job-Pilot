import { api } from "./client.js";

export type ScraperSource = {
  sourceKey: string;
  enabled: boolean;
  maxJobsPerRun: number;
  hasActor: boolean;
  note: string | null;
  updatedAt: string;
};

export type IngestRun = {
  id: string;
  sourceTag: string;
  status: string;
  boardsFetched: number;
  keywordsUsed: number;
  postingsDiscovered: number;
  postingsInserted: number;
  postingsUpdated: number;
  postingsEmbedded: number;
  startedAt: string | null;
  completedAt: string | null;
};

export type IngestionStatus = {
  registry: { total: number; active: number; verified: number };
  pool: { postings: number; newLast24h: number };
  runs: IngestRun[];
};

export async function getScraperSources(): Promise<ScraperSource[]> {
  const { data } = await api.get<{ sources: ScraperSource[] }>("/api/admin/scrapers");
  return data.sources;
}

export async function updateScraperSource(
  sourceKey: string,
  body: { enabled: boolean; maxJobsPerRun: number },
): Promise<ScraperSource> {
  const { data } = await api.put<ScraperSource>(`/api/admin/scrapers/${sourceKey}`, body);
  return data;
}

export async function getIngestionStatus(): Promise<IngestionStatus> {
  const { data } = await api.get<IngestionStatus>("/api/admin/ingestion");
  return data;
}

export async function runIngestion(): Promise<void> {
  await api.post("/api/admin/ingestion/run");
}

export type ExpensesSummary = {
  budget: {
    spentUsd: number;
    softUsd: number;
    hardUsd: number;
    softExceeded: boolean;
    hardExceeded: boolean;
    remainingUsd: number;
  };
  windowDays: number;
  totalCostUsd: number;
  sources: Array<{
    source: string;
    costUsd: number;
    totalScraped: number;
    actorRuns: number;
    jobsHighMatch: number;
    costPerHighMatchJob: number | null;
  }>;
  trend: Array<{ date: string; costUsd: number }>;
  pool: { activePostings: number; lastGlobalRunAt: string | null; lastGlobalRunStatus: string | null };
  globalRun: { mode: string; runHour: number; timezone: string; weekendIngest: boolean };
  tokenConfigured: boolean;
};

export async function getExpenses(days = 14): Promise<ExpensesSummary> {
  const { data } = await api.get<ExpensesSummary>(`/api/admin/expenses?days=${days}`);
  return data;
}

export type RuntimeSettings = {
  apifySpendHardUsdPerDay: number;
  apifySpendSoftUsdPerDay: number;
  apifySplitPercent: number;
  globalRunMode: "manual" | "auto";
  globalRunHour: number;
  timezone: string;
  weekendIngest: boolean;
  purgeWeekday: number;
};

export type JobAnalytics = {
  windowDays: number;
  pool: { total: number; active: number; distinctJobs: number; duplicationRatio: number; newSeenLast24h: number };
  dateCoverage: { releasedLast24h: number; releasedOlder: number; dateUnknown: number };
  bySource: Array<{ source: string; total: number; new24h: number; dateUnknown: number }>;
  topRoles: Array<{ role: string | null; count: number }>;
  bottomRoles: Array<{ role: string | null; count: number }>;
  topCompanies: Array<{ company: string; count: number }>;
  trend: Array<{ date: string; newJobs: number }>;
  ingestion: { discovered: number; inserted: number; updated: number; runs: number };
};

export async function getJobAnalytics(days = 14): Promise<JobAnalytics> {
  const { data } = await api.get<JobAnalytics>(`/api/admin/job-analytics?days=${days}`);
  return data;
}

export async function getAdminSettings(): Promise<RuntimeSettings> {
  const { data } = await api.get<RuntimeSettings>("/api/admin/settings");
  return data;
}

export async function updateAdminSettings(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const { data } = await api.put<RuntimeSettings>("/api/admin/settings", patch);
  return data;
}
