// Jobright — reserved/disabled. Jobright.ai is a consumer job-search product, not a
// data source, and has NO Apify actor. The admin config slot exists (and cannot be
// enabled), but this adapter is a deliberate no-op until a reliable source appears.
import type { RawJob } from "../ats-sources.js";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function scrapeJobright(_keywords: string[], _maxItems: number): Promise<RawJob[]> {
  return [];
}
