// The Muse — public jobs API. Works unauthenticated (lower rate limit); an
// optional API key (THEMUSE_API_KEY) raises it to 3600/hr.
// https://www.themuse.com/api/public/jobs?page=N
import { config } from "../../../lib/config.js";
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type MuseJob = {
  id?: number;
  name?: string;
  company?: { name?: string };
  locations?: Array<{ name?: string }>;
  contents?: string; // HTML
  type?: string;
  publication_date?: string;
  refs?: { landing_page?: string };
  categories?: Array<{ name?: string }>;
};

export async function fetchTheMuse(): Promise<RawJob[]> {
  const key = config.sources.museApiKey;
  const maxPages = Math.max(1, config.sources.maxPagesPerSource);
  const out: RawJob[] = [];
  for (let page = 1; page <= maxPages; page++) {
    const url =
      `https://www.themuse.com/api/public/jobs?page=${page}` + (key ? `&api_key=${encodeURIComponent(key)}` : "");
    const data = await getJson<{ results?: MuseJob[] }>(url);
    if (!data?.results?.length) break;
    for (const j of data.results) {
      out.push({
        source: "themuse",
        atsPlatform: "themuse",
        sourceJobId: String(j.id ?? `${j.company?.name}-${j.name}`),
        title: j.name?.trim() ?? "Untitled",
        company: j.company?.name?.trim() ?? "Unknown",
        locationRaw: j.locations?.map((l) => l.name).filter(Boolean).join("; ") || null,
        department: j.categories?.[0]?.name ?? null,
        descriptionText: j.contents ? stripHtml(j.contents) : "",
        jobUrl: j.refs?.landing_page ?? null,
        applyUrl: j.refs?.landing_page ?? null,
        postedAt: j.publication_date ?? null,
        workplaceType: null,
        commitment: j.type ?? null,
        raw: j,
      });
    }
  }
  return out;
}
