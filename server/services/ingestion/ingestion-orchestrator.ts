// Per-user run factory.
//
// In the global-pool architecture, job DISCOVERY is no longer per-user: the shared
// JobPosting pool is filled by the scheduled global ingestor (global-ingestor.ts),
// and per-user matching reads from it via two-stage retrieval (candidate-generator
// + rerank, driven by application-pipeline.ts). This module now only creates the
// per-user ApplicationRun row that the pipeline operates on.
import { prisma } from "../../lib/db.js";

/**
 * Create a new per-user run (T3) in CREATED state. Callers then trigger the full
 * pipeline (triggerFullPipeline) to run two-stage matching + application generation.
 */
export async function createIngestionRun(
  userId: string,
  triggerType: "payment_activated" | "manual_test" | "scheduled" | "retry",
) {
  return prisma.applicationRun.create({
    data: { userId, status: "CREATED", triggerType },
  });
}
