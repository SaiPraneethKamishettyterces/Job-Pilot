// Apify ingestor — the PAID, admin-gated scraper track. Runs only the sources the
// admin enabled (ScraperSourceConfig), each capped at its admin-set maxJobsPerRun,
// steered by the SAME aggregated demand keywords as the free track. Results land in
// the SAME JobPosting pool and flow through the same two-stage matching. Fail-soft.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import type { RawJob } from "./ats-sources.js";
import type { DemandProfile } from "./demand-profile.js";
import { normalizeJob } from "./job-normalizer.js";
import { upsertPosting } from "../../repositories/job-posting-repository.js";
import { embedPendingPostings } from "./embed-postings.js";
import { hasApify } from "./scrapers/apify.js";
import { scrapeLinkedIn } from "./scrapers/linkedin.js";
import { scrapeIndeed } from "./scrapers/indeed.js";
import { scrapeHiringCafe } from "./scrapers/hiringcafe.js";
import { scrapeJobright } from "./scrapers/jobright.js";

type Scraper = (keywords: string[], maxItems: number) => Promise<RawJob[]>;

const SCRAPERS: Record<string, Scraper> = {
  linkedin: scrapeLinkedIn,
  indeed: scrapeIndeed,
  hiringcafe: scrapeHiringCafe,
  jobright: scrapeJobright, // no-op stub
};

/**
 * Run the enabled Apify scrapers and upsert results into the global pool. No-op
 * when APIFY_TOKEN is unset or no source is enabled. Records a source-tagged
 * GlobalIngestRun. Never throws.
 */
export async function runApifyIngestion(demand: DemandProfile): Promise<string | null> {
  if (!hasApify()) return null; // not configured — skip the paid track entirely

  const enabled = await prisma.scraperSourceConfig.findMany({ where: { enabled: true } });
  if (!enabled.length) return null;

  const run = await prisma.globalIngestRun.create({
    data: { sourceTag: "apify", status: "FETCHING", startedAt: new Date() },
  });

  try {
    const keywords = demand.roleKeywords.slice(0, config.apify.maxKeywords);
    let discovered = 0;
    let inserted = 0;
    let updated = 0;
    const seen = new Set<string>();

    for (const cfg of enabled) {
      const scraper = SCRAPERS[cfg.sourceKey];
      if (!scraper) continue;
      const jobs = await scraper(keywords, cfg.maxJobsPerRun);
      discovered += jobs.length;
      logger.info({ source: cfg.sourceKey, count: jobs.length, cap: cfg.maxJobsPerRun }, "Apify source scraped");
      for (const raw of jobs) {
        const norm = normalizeJob(raw);
        if (seen.has(norm.dedupeKey)) continue;
        seen.add(norm.dedupeKey);
        try {
          const res = await upsertPosting(norm);
          if (res.isNew) inserted++;
          else updated++;
        } catch (err) {
          logger.warn({ dedupeKey: norm.dedupeKey, err: String(err) }, "Apify posting upsert failed");
        }
      }
    }

    await prisma.globalIngestRun.update({
      where: { id: run.id },
      data: {
        status: "EMBEDDING",
        boardsFetched: enabled.length,
        keywordsUsed: keywords.length,
        postingsDiscovered: discovered,
        postingsInserted: inserted,
        postingsUpdated: updated,
      },
    });

    const embedded = await embedPendingPostings();

    await prisma.globalIngestRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", postingsEmbedded: embedded, completedAt: new Date() },
    });
    logger.info({ runId: run.id, discovered, inserted, updated, embedded }, "Apify ingestion completed");
    return run.id;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ runId: run.id, err: msg }, "Apify ingestion failed");
    await prisma.globalIngestRun
      .update({ where: { id: run.id }, data: { status: "FAILED", errorMessage: msg, completedAt: new Date() } })
      .catch(() => {});
    return run.id;
  }
}
