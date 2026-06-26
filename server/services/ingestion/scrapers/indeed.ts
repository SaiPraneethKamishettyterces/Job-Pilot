// Indeed via Apify (misceres/indeed-scraper). Result cap = `maxItemsPerSearch`.
import { config } from "../../../lib/config.js";
import { stripHtml, type RawJob } from "../ats-sources.js";
import { runActor, perQueryBudget, str } from "./apify.js";

export async function scrapeIndeed(
  keywords: string[],
  maxItems: number,
  ctx: { runId?: string | null } = {},
): Promise<RawJob[]> {
  const queries = keywords.length ? keywords : ["software engineer"];
  const perSearch = perQueryBudget(maxItems, queries.length);
  const out: RawJob[] = [];
  for (const position of queries) {
    const { items, unitCostUsd } = await runActor(
      config.apify.actors.indeed,
      { position, location: "United States", country: "US", maxItemsPerSearch: perSearch },
      perSearch,
      { sourceKey: "indeed", runId: ctx.runId, query: position },
    );
    for (const j of items) {
      out.push({
        source: "indeed",
        atsPlatform: "indeed",
        sourceJobId: str(j, "jobId", "id", "jobUrl") ?? `${position}-${out.length}`,
        title: str(j, "jobTitle", "positionName", "title") ?? "Untitled",
        company: str(j, "companyName", "company") ?? "Unknown",
        locationRaw: str(j, "location"),
        department: null,
        descriptionText: stripHtml(str(j, "jobDescription", "description") ?? ""),
        jobUrl: str(j, "jobUrl", "url"),
        applyUrl: str(j, "applyUrl", "externalApplyLink", "jobUrl"),
        postedAt: str(j, "postedAt", "date", "postingDateParsed"),
        workplaceType: null,
        commitment: str(j, "employmentType", "jobType"),
        raw: j,
        acquisitionCostUsd: unitCostUsd,
      });
    }
  }
  return out;
}
