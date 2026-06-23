// Arbeitnow — free public job-board API. No auth.
// https://www.arbeitnow.com/api/job-board-api
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type ArbeitnowJob = {
  slug?: string;
  company_name?: string;
  title?: string;
  description?: string; // HTML
  remote?: boolean;
  url?: string;
  tags?: string[];
  job_types?: string[];
  location?: string;
  created_at?: number; // unix seconds
};

export async function fetchArbeitnow(): Promise<RawJob[]> {
  const data = await getJson<{ data?: ArbeitnowJob[] }>("https://www.arbeitnow.com/api/job-board-api");
  if (!data?.data?.length) return [];
  return data.data.map((j) => ({
    source: "arbeitnow",
    atsPlatform: "arbeitnow",
    sourceJobId: j.slug ?? `${j.company_name}-${j.title}`,
    title: j.title?.trim() ?? "Untitled",
    company: j.company_name?.trim() ?? "Unknown",
    locationRaw: j.location ?? null,
    department: null,
    descriptionText: j.description ? stripHtml(j.description) : "",
    jobUrl: j.url ?? null,
    applyUrl: j.url ?? null,
    postedAt: j.created_at ? new Date(j.created_at * 1000).toISOString() : null,
    workplaceType: j.remote ? "remote" : null,
    commitment: j.job_types?.[0] ?? null,
    raw: j,
  }));
}
