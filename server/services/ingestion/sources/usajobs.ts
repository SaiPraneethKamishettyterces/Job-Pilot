// USAJOBS — US federal jobs API. Requires a free API key + a contact email in
// the User-Agent header; self-skips when not configured.
// https://developer.usajobs.gov/
import { config } from "../../../lib/config.js";
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type UsaJobsItem = {
  MatchedObjectId?: string;
  MatchedObjectDescriptor?: {
    PositionTitle?: string;
    OrganizationName?: string;
    PositionLocationDisplay?: string;
    PositionURI?: string;
    ApplyURI?: string[];
    UserArea?: { Details?: { JobSummary?: string } };
    PositionRemuneration?: Array<{ MinimumRange?: string; MaximumRange?: string; RateIntervalCode?: string }>;
    PublicationStartDate?: string;
    PositionSchedule?: Array<{ Name?: string }>;
  };
};

function toRawJob(it: UsaJobsItem): RawJob {
  const d = it.MatchedObjectDescriptor ?? {};
  const pay = d.PositionRemuneration?.[0];
  return {
    source: "usajobs",
    atsPlatform: "usajobs",
    sourceJobId: String(it.MatchedObjectId ?? d.PositionURI ?? d.PositionTitle),
    title: d.PositionTitle?.trim() ?? "Untitled",
    company: d.OrganizationName?.trim() ?? "US Federal Government",
    locationRaw: d.PositionLocationDisplay ?? null,
    department: null,
    descriptionText: d.UserArea?.Details?.JobSummary ? stripHtml(d.UserArea.Details.JobSummary) : "",
    jobUrl: d.PositionURI ?? null,
    applyUrl: d.ApplyURI?.[0] ?? d.PositionURI ?? null,
    postedAt: d.PublicationStartDate ?? null,
    workplaceType: null,
    commitment: d.PositionSchedule?.[0]?.Name ?? null,
    raw: { salaryMin: pay?.MinimumRange, salaryMax: pay?.MaximumRange, rate: pay?.RateIntervalCode, item: it },
  };
}

/**
 * Demand-driven: one `Keyword=<keyword>` search per aggregated target role. Falls
 * back to a broad keyword-less pull when no keywords are supplied.
 */
export async function fetchUsaJobs(opts?: { keywords?: string[] }): Promise<RawJob[]> {
  const { usajobsApiKey: key, usajobsUserAgent: ua } = config.sources;
  if (!key) return []; // not configured — skip silently
  const maxPages = Math.max(1, config.sources.maxPagesPerSource);
  const headers = { Host: "data.usajobs.gov", "User-Agent": ua, "Authorization-Key": key };
  const queries = opts?.keywords?.length ? opts.keywords : [""];

  const out: RawJob[] = [];
  for (const kw of queries) {
    for (let page = 1; page <= maxPages; page++) {
      const url =
        `https://data.usajobs.gov/api/search?ResultsPerPage=50&Page=${page}` +
        (kw ? `&Keyword=${encodeURIComponent(kw)}` : "");
      const data = await getJson<{ SearchResult?: { SearchResultItems?: UsaJobsItem[] } }>(url, headers);
      const items = data?.SearchResult?.SearchResultItems;
      if (!items?.length) break;
      for (const it of items) out.push(toRawJob(it));
    }
  }
  return out;
}
