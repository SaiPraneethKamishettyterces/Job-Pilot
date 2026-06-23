// Remotive — free public remote-jobs API. No auth.
// https://remotive.com/api/remote-jobs  (poll sparingly: ≤4×/day per their terms)
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type RemotiveJob = {
  id: number;
  url?: string;
  title?: string;
  company_name?: string;
  category?: string;
  job_type?: string;
  candidate_required_location?: string;
  publication_date?: string;
  salary?: string;
  description?: string; // HTML
};

export async function fetchRemotive(): Promise<RawJob[]> {
  const data = await getJson<{ jobs?: RemotiveJob[] }>("https://remotive.com/api/remote-jobs");
  if (!data?.jobs?.length) return [];
  return data.jobs.map((j) => ({
    source: "remotive",
    atsPlatform: "remotive",
    sourceJobId: String(j.id),
    title: j.title?.trim() ?? "Untitled",
    company: j.company_name?.trim() ?? "Unknown",
    locationRaw: j.candidate_required_location ?? "Remote",
    department: j.category ?? null,
    descriptionText: j.description ? stripHtml(j.description) : "",
    jobUrl: j.url ?? null,
    applyUrl: j.url ?? null,
    postedAt: j.publication_date ?? null,
    workplaceType: "remote",
    commitment: j.job_type ?? null,
    raw: j,
  }));
}
