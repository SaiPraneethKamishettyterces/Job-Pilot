// Seed the ATS company registry (JobSource) from the vendored starter list.
// Run: `npm run seed:sources`. Idempotent — safe to re-run. The long tail of
// thousands of companies is filled at runtime by registry-sync (ATS_REGISTRY_SYNC_URL).
import "dotenv/config"; // load .env before db.ts reads DATABASE_URL
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { persistBoards, type RegistryEntry } from "../services/ingestion/registry.js";

async function main(): Promise<void> {
  const path = fileURLToPath(new URL("../data/ats-companies.json", import.meta.url));
  const parsed = JSON.parse(readFileSync(path, "utf8")) as { companies?: RegistryEntry[] };
  const entries = (parsed.companies ?? []).filter((e) => e?.ats && e?.token);
  if (!entries.length) {
    logger.warn("seed-ats-sources: no companies found in ats-companies.json");
    return;
  }
  const written = await persistBoards(entries);
  const total = await prisma.jobSource.count();
  logger.info({ seeded: written, registryTotal: total }, "seed-ats-sources: done");
}

main()
  .catch((err) => {
    logger.error({ err: String(err) }, "seed-ats-sources failed");
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
