// LinkedIn Jobs via Apify (bebity/linkedin-jobs-scraper). Result cap = `rows`.
// Iterates the aggregated role keywords; the per-source budget is split across them.
import { config } from "../../../lib/config.js";
import { stripHtml, type RawJob } from "../ats-sources.js";
import { runActor, perQueryBudget, str } from "./apify.js";

export async function scrapeLinkedIn(keywords: string[], maxItems: number): Promise<RawJob[]> {
  const queries = keywords.length ? keywords : ["software engineer"];
  const rows = perQueryBudget(maxItems, queries.length);
  const out: RawJob[] = [];
  for (const title of queries) {
    const items = await runActor(
      config.apify.actors.linkedin,
      { title, location: "United States", rows },
      rows,
    );
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
      });
    }
  }
  return out;
}
