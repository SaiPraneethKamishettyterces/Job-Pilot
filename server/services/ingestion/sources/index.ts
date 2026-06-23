// Free aggregator-API sources, fanned out in parallel. Each adapter fails soft
// (returns [] on error or when unconfigured), so one bad source never sinks the
// ingest cycle. Used by the global ingestor alongside the ATS board registry.
import { logger } from "../../../lib/logger.js";
import type { RawJob } from "../ats-sources.js";
import type { DemandProfile } from "../demand-profile.js";
import { fetchRemotive } from "./remotive.js";
import { fetchRemoteOk } from "./remoteok.js";
import { fetchArbeitnow } from "./arbeitnow.js";
import { fetchTheMuse } from "./themuse.js";
import { fetchAdzuna } from "./adzuna.js";
import { fetchUsaJobs } from "./usajobs.js";

/**
 * Fetch all aggregator sources concurrently. Full-dump feeds run unfiltered
 * (broad baseline); the search APIs (Adzuna, USAJOBS) are steered by the
 * aggregated role keywords in `demand` when provided. Returns the union of jobs.
 */
export async function fetchAggregatorSources(
  demand?: DemandProfile,
): Promise<{ jobs: RawJob[]; sourcesUsed: number }> {
  const keywords = demand?.roleKeywords;
  const aggregators: Array<{ name: string; fetch: () => Promise<RawJob[]> }> = [
    { name: "remotive", fetch: fetchRemotive },
    { name: "remoteok", fetch: fetchRemoteOk },
    { name: "arbeitnow", fetch: fetchArbeitnow },
    { name: "themuse", fetch: fetchTheMuse },
    { name: "adzuna", fetch: () => fetchAdzuna({ keywords }) },
    { name: "usajobs", fetch: () => fetchUsaJobs({ keywords }) },
  ];

  const results = await Promise.allSettled(aggregators.map((a) => a.fetch()));
  const jobs: RawJob[] = [];
  let sourcesUsed = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      if (r.value.length) sourcesUsed++;
      jobs.push(...r.value);
      logger.info({ source: aggregators[i]!.name, count: r.value.length }, "Aggregator source fetched");
    } else {
      logger.warn({ source: aggregators[i]!.name, err: String(r.reason) }, "Aggregator source failed");
    }
  });
  return { jobs, sourcesUsed };
}
