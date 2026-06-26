// LinkedIn Jobs via Apify (bebity/linkedin-jobs-scraper). Result cap = `rows`.
// Iterates the aggregated role keywords; the per-source budget is split across them.
//
// The actor supports SERVER-SIDE filters we now use (previously unused):
//   publishedAt    — r86400=24h | r604800=7d | r2592000=30d (the only real
//                    server-side recency filter across all our sources)
//   experienceLevel— 1 intern | 2 entry | 3 associate | 4 mid-senior | 5 director
//   location       — configurable (no longer hardcoded to the US)
// LinkedIn is used as a DISCOVERY source (never the sole apply path) per the spec.
import { config } from "../../../lib/config.js";
import { stripHtml, type RawJob } from "../ats-sources.js";
import { runActor, perQueryBudget, str } from "./apify.js";

export type LinkedInOpts = {
  /** Recency filter: r86400 (24h) | r604800 (7d) | r2592000 (30d) | "" (any). */
  publishedAt?: string;
  /** LinkedIn experienceLevel code "1".."5"; omit for no filter. */
  experienceLevel?: string;
  location?: string;
  /** GlobalIngestRun this scrape belongs to (per-call cost ledger). */
  runId?: string | null;
};

// Map our candidate seniority band → LinkedIn experienceLevel code (best-effort).
const BAND_TO_LEVEL: Record<string, string> = {
  entry: "2",
  junior_associate: "3",
  early_mid: "4",
  mid_senior: "4",
  senior: "4",
  staff_lead: "5",
  principal_executive: "5",
};

export function bandToExperienceLevel(band: string | null | undefined): string | undefined {
  return band ? BAND_TO_LEVEL[band] : undefined;
}

export async function scrapeLinkedIn(
  keywords: string[],
  maxItems: number,
  opts: LinkedInOpts = {},
): Promise<RawJob[]> {
  const queries = keywords.length ? keywords : ["software engineer"];
  const rows = perQueryBudget(maxItems, queries.length);
  const publishedAt = opts.publishedAt ?? config.apify.linkedinPublishedAt;
  const location = opts.location ?? config.apify.linkedinLocation;
  const out: RawJob[] = [];
  for (const title of queries) {
    const input: Record<string, unknown> = { title, location, rows, publishedAt };
    if (opts.experienceLevel) input["experienceLevel"] = opts.experienceLevel;
    const { items, unitCostUsd } = await runActor(config.apify.actors.linkedin, input, rows, {
      sourceKey: "linkedin",
      runId: opts.runId,
      query: title,
    });
    for (const j of items) {
      const desc = str(j, "jobDescription", "description") ?? "";
      out.push({
        source: "linkedin",
        atsPlatform: "linkedin",
        sourceJobId: str(j, "id", "jobUrl", "jobTitle") ?? `${title}-${out.length}`,
        title: str(j, "jobTitle", "title") ?? "Untitled",
        company: str(j, "companyName", "company") ?? "Unknown",
        locationRaw: str(j, "location"),
        department: null,
        descriptionText: stripHtml(desc),
        jobUrl: str(j, "jobUrl", "link"),
        applyUrl: str(j, "applyUrl", "jobUrl"),
        postedAt: str(j, "postedAt", "publishedAt"),
        workplaceType: str(j, "workType"),
        commitment: str(j, "contractType", "employmentType"),
        raw: j,
        acquisitionCostUsd: unitCostUsd,
      });
    }
  }
  return out;
}
