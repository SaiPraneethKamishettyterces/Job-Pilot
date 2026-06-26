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

export type ExpenseSource = {
  source: string;
  costUsd: number; // paid scraper spend (Apify)
  embedCostUsd: number; // embedding cost attributed to this source
  totalCostUsd: number; // unified: acquisition + embedding
  totalScraped: number;
  totalNew: number;
  totalDuplicates: number;
  dedupRatio: number | null;
  actorRuns: number;
  jobsHighMatch: number;
  costPerHighMatchJob: number | null;
  costPerNewJob: number | null;
};

export type ExpenseRun = {
  id: string;
  sourceTag: string;
  status: string;
  costUsd: number;
  embedCostUsd: number;
  callCount: number;
  postingsDiscovered: number;
  postingsInserted: number;
  postingsEmbedded: number;
  startedAt: string | null;
  completedAt: string | null;
};

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
  totalEmbedCostUsd: number;
  unifiedTotalUsd: number;
  projection: { monthToDateUsd: number; projectedMonthUsd: number };
  sources: ExpenseSource[];
  runs: ExpenseRun[];
  trend: Array<{ date: string; costUsd: number }>;
  pool: { activePostings: number; lastGlobalRunAt: string | null; lastGlobalRunStatus: string | null };
  globalRun: { mode: string; runHour: number; timezone: string; weekendIngest: boolean };
  tokenConfigured: boolean;
};

export async function getExpenses(days = 14): Promise<ExpensesSummary> {
  const { data } = await api.get<ExpensesSummary>(`/api/admin/expenses?days=${days}`);
  return data;
}

// ─── Scraper run drill-down ───────────────────────────────────────────────────
export type ScraperRunsReport = {
  windowDays: number;
  events: Array<{
    id: string; runId: string | null; kind: string; source: string; actorName: string | null;
    query: string | null; itemsReturned: number; itemsNew: number; itemsDuplicate: number;
    costUsd: number; estimated: boolean; durationMs: number; status: string; createdAt: string;
  }>;
  byKeyword: Array<{ source: string; query: string | null; calls: number; costUsd: number; items: number; costPerItem: number | null }>;
  reliability: Array<{ source: string; calls: number; errors: number; capped: number; errorRate: number; avgDurationMs: number; items: number }>;
};

export async function getScraperRuns(days = 7, source?: string): Promise<ScraperRunsReport> {
  const qs = `days=${days}${source ? `&source=${encodeURIComponent(source)}` : ""}`;
  const { data } = await api.get<ScraperRunsReport>(`/api/admin/scraper-runs?${qs}`);
  return data;
}

// ─── Storage / infra ──────────────────────────────────────────────────────────
export type StorageReport = {
  asOf: string | null;
  database: { bytesTotal: number; gb: number };
  blob: { bytesTotal: number; gb: number };
  projection: { dbUsdPerMonth: number; blobUsdPerMonth: number; dbRateUsdPerGbMonth: number; blobRateUsdPerGbMonth: number };
  growth: { bytesPerDay: number; gbPerDay: number; projectedGb30d: number };
  tables: Array<{ key: string; bytesTotal: number; bytesHeap: number; bytesIndex: number; bytesToast: number; rowCount: number }>;
  sources: Array<{ key: string; bytesTotal: number; rowCount: number }>;
  artifactTypes: Array<{ key: string; bytesTotal: number; rowCount: number }>;
  topUsers: Array<{ key: string; bytesTotal: number; rowCount: number }>;
  trend: Array<{ date: string; bytesTotal: number }>;
};

export async function getStorage(days = 30): Promise<StorageReport> {
  const { data } = await api.get<StorageReport>(`/api/admin/storage?days=${days}`);
  return data;
}

export async function snapshotStorage(): Promise<{ rows: number }> {
  const { data } = await api.post<{ rows: number }>("/api/admin/storage/snapshot");
  return data;
}

// ─── Job-pool explorer ────────────────────────────────────────────────────────
export type JobExplorerRow = {
  id: string; title: string; company: string; location: string | null; sourceName: string | null;
  remoteType: string | null; seniority: string | null; employmentType: string | null;
  postingStatus: string | null; postedAt: string | null; firstSeenAt: string; sourceCount: number;
  acquisitionCostUsd: number | null; embedCostUsd: number | null; totalCostUsd: number | null;
  sizeBytes: number; matchCount: number; bestScore: number | null;
};

export type JobExplorerResult = {
  page: number; pageSize: number; total: number; totalPages: number; jobs: JobExplorerRow[];
};

export type JobExplorerFilters = {
  page?: number; pageSize?: number; status?: string; source?: string; remoteType?: string;
  seniority?: string; company?: string; q?: string; freshnessDays?: number; sort?: string; order?: string;
};

export async function getJobs(filters: JobExplorerFilters = {}): Promise<JobExplorerResult> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v !== undefined && v !== "") params.set(k, String(v));
  const { data } = await api.get<JobExplorerResult>(`/api/admin/jobs?${params.toString()}`);
  return data;
}

export type JobDetail = {
  posting: Record<string, unknown> & {
    id: string; title: string; company: string; location: string | null; sourceName: string | null;
    description: string; skills: unknown;
  };
  cost: { acquisitionCostUsd: number | null; embedCostUsd: number | null; totalCostUsd: number | null };
  size: { totalBytes: number; rawJsonBytes: number; embeddingBytes: number };
  acquiredByRun: { id: string; sourceTag: string; startedAt: string | null } | null;
  matches: Array<{ score: number; tier: string | null; userId: string }>;
};

export async function getJobDetail(id: string): Promise<JobDetail> {
  const { data } = await api.get<JobDetail>(`/api/admin/jobs/${id}`);
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
