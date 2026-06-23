// Registry import/resync — pull the public GitHub seed datasets (stapply / Feashliaa
// / OpenJobs, per config) and bulk-insert them into the JobSource registry, taking
// coverage from a handful of curated companies to tens of thousands. Fail-soft.
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { prisma } from "../../lib/db.js";
import { importAllSeedSources } from "./registry-sources.js";
import { bulkInsertBoards } from "./registry.js";

/**
 * Import all enabled seed sources into the registry. Returns the number of NEW
 * boards inserted. Safe to re-run (skipDuplicates). Used by the CLI seed script and
 * the scheduled resync.
 */
export async function importRegistry(): Promise<number> {
  const entries = await importAllSeedSources();
  if (!entries.length) {
    logger.warn("Registry import: no entries (no seed source enabled or all fetches failed)");
    return 0;
  }
  const inserted = await bulkInsertBoards(entries);
  const total = await prisma.jobSource.count();
  logger.info({ fetched: entries.length, inserted, registryTotal: total }, "Registry import completed");
  return inserted;
}

/** Scheduled resync — gated by ATS_REGISTRY_SYNC_ENABLED. No-op when off. */
export async function syncRegistry(): Promise<number> {
  if (!config.registry.syncEnabled) {
    logger.info("Registry sync skipped (ATS_REGISTRY_SYNC_ENABLED off)");
    return 0;
  }
  try {
    return await importRegistry();
  } catch (err) {
    logger.error({ err: String(err) }, "Registry sync failed");
    return 0;
  }
}
