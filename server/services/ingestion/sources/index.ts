// Free aggregator-API sources, fanned out in parallel. Each adapter fails soft
// (returns [] on error or when unconfigured), so one bad source never sinks the
// ingest cycle. Used by the global ingestor alongside the ATS board registry.
import { logger } from "../../../lib/logger.js";
import { config } from "../../../lib/config.js";
import type { RawJob } from "../ats-sources.js";
import type { DemandProfile } from "../demand-profile.js";
import { fetchRemotive } from "./remotive.js";
import { fetchRemoteOk } from "./remoteok.js";
import { fetchArbeitnow } from "./arbeitnow.js";
import { fetchTheMuse } from "./themuse.js";
import { fetchAdzuna } from "./adzuna.js";
import { fetchUsaJobs } from "./usajobs.js";
import { fetchJobicy } from "./jobicy.js";
import { fetchWeWorkRemotely } from "./weworkremotely.js";
import { fetchHimalayas } from "./himalayas.js";
import { fetchWorkingNomads } from "./workingnomads.js";

/**
 * Fetch all aggregator sources concurrently. Full-dump feeds run unfiltered
 * (broad baseline); the search APIs (Adzuna, USAJOBS) are steered by the
 * aggregated role keywords in `demand` when provided. Returns the union of jobs.
 */
export async function fetchAggregatorSources(
  demand?: DemandProfile,
): Promise<{ jobs: RawJob[]; sourcesUsed: number }> {
  const keywords = demand?.roleKeywords;
  const en = config.sources.enabled;
  // Per-source enable flags (config.sources.enabled) let ops turn any source off
  // without a redeploy. Disabled sources are skipped entirely (not fetched).
  const all: Array<{ name: string; on: boolean; fetch: () => Promise<RawJob[]> }> = [
    { name: "remotive", on: en.remotive, fetch: fetchRemotive },
    { name: "remoteok", on: en.remoteok, fetch: fetchRemoteOk },
    { name: "arbeitnow", on: en.arbeitnow, fetch: fetchArbeitnow },
    { name: "themuse", on: en.themuse, fetch: fetchTheMuse },
    { name: "adzuna", on: en.adzuna, fetch: () => fetchAdzuna({ keywords }) },
    { name: "usajobs", on: en.usajobs, fetch: () => fetchUsaJobs({ keywords }) },
    // Part 1.7 — keyless, timestamped fresh sources.
    { name: "jobicy", on: en.jobicy, fetch: fetchJobicy },
    { name: "weworkremotely", on: en.weworkremotely, fetch: fetchWeWorkRemotely },
    { name: "himalayas", on: en.himalayas, fetch: fetchHimalayas },
    { name: "workingnomads", on: en.workingnomads, fetch: fetchWorkingNomads },
  ];
  const aggregators = all.filter((a) => a.on);

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
