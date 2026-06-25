// Hiring Cafe via Apify (automation-lab/hiring-cafe-jobs-scraper). Result cap =
// `maxItems` (total across queries), so we pass the role keywords as searchQueries
// and the admin budget directly.
import { config } from "../../../lib/config.js";
import { stripHtml, type RawJob } from "../ats-sources.js";
import { runActor, str } from "./apify.js";

export async function scrapeHiringCafe(keywords: string[], maxItems: number): Promise<RawJob[]> {
  const searchQueries = keywords.length ? keywords : ["software engineer"];
  const items = await runActor(
    config.apify.actors.hiringcafe,
    { searchQueries, maxItems, includeDescriptionHtml: false },
    maxItems,
    "hiringcafe",
  );
  return items.map((j, i) => ({
    source: "hiringcafe",
    atsPlatform: str(j, "sourcePlatform") ?? "hiringcafe", // original board (LinkedIn, ZipRecruiter, …)
    sourceJobId: str(j, "jobId", "id") ?? `hc-${i}`,
    title: str(j, "jobTitle", "title") ?? "Untitled",
    company: str(j, "companyName", "company") ?? "Unknown",
    locationRaw: str(j, "location"),
    department: null,
    descriptionText: stripHtml(str(j, "description") ?? ""),
    jobUrl: str(j, "applyUrl", "url"),
    applyUrl: str(j, "applyUrl", "url"),
    postedAt: str(j, "postedAt", "datePosted"),
    workplaceType: str(j, "remoteType"),
    commitment: str(j, "employmentType"),
    raw: j,
  }));
}
