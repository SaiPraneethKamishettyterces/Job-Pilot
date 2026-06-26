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

export type ClaudeUsage = {
  windowDays: number;
  pricing: {
    model: string;
    inputPerMtok: number;
    outputPerMtok: number;
    cacheReadMultiplier: number;
    cacheCreationPriced: boolean;
  };
  totals: {
    claudeCostUsd: number;
    claudeCalls: number;
    totalAiCalls: number;
    localCalls: number;
    appsTotal: number;
    appsWithClaude: number;
    claudePct: number;
    blendedCostPerApp: number;
  };
  budget: {
    monthlyBudgetUsd: number;
    monthToDateUsd: number;
    monthPct: number;
    projectedMonthlyUsd: number;
    costPerResumeWarnUsd: number;
    costPerResumeOverWarn: boolean;
  };
  margins: {
    slug: string;
    name: string;
    priceMonthly: number;
    applicationsPerMonth: number;
    revenuePerApp: number;
    marginClaudeResume: number;
    marginBlendedApp: number;
    claudeResumeProfitable: boolean;
  }[];
  recommendations: {
    id: string;
    title: string;
    detail: string;
    estSavingPerResumeUsd: number;
  }[];
  perFeature: {
    featureName: string;
    model: string;
    provider: "anthropic" | "local";
    isClaude: boolean;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    avgCostUsd: number;
  }[];
  resume: {
    calls: number;
    avgCostUsd: number;
    minCostUsd: number;
    maxCostUsd: number;
    avgInputTokens: number;
    avgOutputTokens: number;
    inputCostUsd: number;
    outputCostUsd: number;
    sampleResumes: number;
    sectionShares: { section: string; pct: number; estCostUsd: number }[];
  };
  costFactors: {
    measuredCalls: number;
    input: { factor: string; tokens: number; avgTokens: number; costUsd: number; pct: number }[];
    output: { factor: string; tokens: number; avgTokens: number; costUsd: number; pct: number }[];
  };
  spendPerUser: { userId: string; name: string; costUsd: number; calls: number; avgCostUsd: number }[];
  trend: { date: string; costUsd: number; calls: number; cumulativeUsd: number }[];
  recent: {
    createdAt: string;
    jobTitle: string | null;
    company: string | null;
    status: string | null;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    costUsd: number;
    applicationId: string | null;
  }[];
  reconciliation: ClaudeReconciliation | null;
};

export type ClaudeReconciliation = {
  actualBilledUsd: number;
  totalInput: number;
  totalOutput: number;
  periodStart: string;
  periodEnd: string;
  importedAt: string;
  byKey: { key: string; costUsd: number; input: number; output: number }[];
};

export async function getClaudeUsage(days = 30): Promise<ClaudeUsage> {
  const { data } = await api.get<ClaudeUsage>("/api/admin/claude-usage", { params: { days } });
  return data;
}

export async function reconcileClaudeUsage(csv: string): Promise<ClaudeReconciliation> {
  const { data } = await api.post<ClaudeReconciliation>("/api/admin/claude-usage/reconcile", { csv });
  return data;
}

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
  claudeMonthlyBudgetUsd: number;
  claudeCostPerResumeWarnUsd: number;
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
