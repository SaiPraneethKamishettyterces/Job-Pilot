// Working Nomads — free public remote-jobs API. No auth.
// https://www.workingnomads.com/api/exposed_jobs/  (poll ~1×/day per our cycle)
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type WnJob = {
  id?: number | string;
  url?: string;
  title?: string;
  company_name?: string;
  category_name?: string;
  tags?: string;
  description?: string; // HTML
  location?: string;
  pub_date?: string; // ISO
  source?: string;
};

export async function fetchWorkingNomads(): Promise<RawJob[]> {
  const data = await getJson<WnJob[]>("https://www.workingnomads.com/api/exposed_jobs/");
  if (!Array.isArray(data) || !data.length) return [];
  return data.map((j) => ({
    source: "workingnomads",
    atsPlatform: "workingnomads",
    sourceJobId: String(j.id ?? j.url ?? j.title ?? "unknown"),
    title: j.title?.trim() ?? "Untitled",
    company: j.company_name?.trim() ?? "Unknown",
    locationRaw: j.location?.trim() || "Remote",
    department: j.category_name ?? null,
    descriptionText: j.description ? stripHtml(j.description) : "",
    jobUrl: j.url ?? null,
    applyUrl: j.url ?? null,
    postedAt: j.pub_date ?? null,
    workplaceType: "remote",
    commitment: null,
    raw: j,
  }));
}
