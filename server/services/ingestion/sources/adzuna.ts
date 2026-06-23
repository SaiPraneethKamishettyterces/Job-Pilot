// Adzuna — job search API (free tier). Requires free app id + key; self-skips
// when not configured. https://developer.adzuna.com/
import { config } from "../../../lib/config.js";
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type AdzunaJob = {
  id?: string;
  title?: string;
  company?: { display_name?: string };
  location?: { display_name?: string };
  description?: string; // truncated plain-ish text
  redirect_url?: string;
  created?: string;
  salary_min?: number;
  salary_max?: number;
  contract_type?: string;
  contract_time?: string;
};

function toRawJob(j: AdzunaJob): RawJob {
  return {
    source: "adzuna",
    atsPlatform: "adzuna",
    sourceJobId: String(j.id ?? `${j.company?.display_name}-${j.title}`),
    title: j.title?.trim() ?? "Untitled",
    company: j.company?.display_name?.trim() ?? "Unknown",
    locationRaw: j.location?.display_name ?? null,
    department: null,
    descriptionText: j.description ? stripHtml(j.description) : "",
    jobUrl: j.redirect_url ?? null,
    applyUrl: j.redirect_url ?? null,
    postedAt: j.created ?? null,
    workplaceType: null,
    commitment: j.contract_time ?? j.contract_type ?? null,
    raw: j,
  };
}

/**
 * Demand-driven: when `keywords` are supplied (aggregated user target roles), one
 * `what=<keyword>` search per keyword. When absent (no active subscribers / dev),
 * falls back to a broad keyword-less pull so the pool still gets Adzuna data.
 */
export async function fetchAdzuna(opts?: { keywords?: string[] }): Promise<RawJob[]> {
  const { adzunaAppId: appId, adzunaAppKey: appKey, adzunaCountry: country } = config.sources;
  if (!appId || !appKey) return []; // not configured — skip silently
  const maxPages = Math.max(1, config.sources.maxPagesPerSource);
  // Empty string = the broad, keyword-less fallback query.
  const queries = opts?.keywords?.length ? opts.keywords : [""];

  const out: RawJob[] = [];
  for (const kw of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const url =
        `https://api.adzuna.com/v1/api/jobs/${encodeURIComponent(country)}/search/${page}` +
        `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
        `&results_per_page=50&content-type=application/json` +
        (kw ? `&what=${encodeURIComponent(kw)}` : "");
      const data = await getJson<{ results?: AdzunaJob[] }>(url);
      if (!data?.results?.length) break;
      for (const j of data.results) out.push(toRawJob(j));
    }
  }
  return out;
}
