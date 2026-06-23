// Import the public GitHub seed datasets (stapply / Feashliaa / OpenJobs, per the
// ATS_SEED_* flags) into the JobSource registry. Run: `npm run seed:registry`.
// Idempotent (skipDuplicates). This is what takes coverage to tens of thousands.
import "dotenv/config"; // load .env before db.ts reads DATABASE_URL
import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { importRegistry } from "../services/ingestion/registry-sync.js";

importRegistry()
  .then((inserted) => logger.info({ inserted }, "import-registry: done"))
  .catch((err) => {
    logger.error({ err: String(err) }, "import-registry failed");
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());
