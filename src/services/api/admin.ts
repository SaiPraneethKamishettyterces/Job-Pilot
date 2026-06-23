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
