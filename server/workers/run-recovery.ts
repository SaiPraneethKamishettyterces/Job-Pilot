import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { runApplicationPipeline } from "./application-pipeline.js";

// Recovery for pipeline runs that were left in a non-terminal state — e.g. the
// Cloud Run instance that started the (in-process, fire-and-forget) pipeline was
// recycled mid-run. A periodic pass (driven by the retry worker) re-drives such
// runs. runApplicationPipeline is idempotent (it skips jobs that already have an
// Application for the run), so re-running is safe.
//
// NOTE: the durable long-term design is an external queue (Cloud Tasks/PubSub)
// with a single consumer; this recovery + the atomic retry claim make the current
// in-process model safe enough for small scale without one.

const STUCK_STATUSES = ["DISCOVERING_JOBS", "PARSING_JOBS", "SCORING", "GENERATING_DOCUMENTS"];

/** Find and re-drive runs stuck longer than the configured threshold. */
export async function recoverStuckRuns(): Promise<number> {
  const mins = config.automation.retry.stuckRunMinutes;
  const threshold = new Date(Date.now() - mins * 60_000);

  const candidates = await prisma.applicationRun.findMany({
    where: { status: { in: STUCK_STATUSES as unknown as never[] }, updatedAt: { lt: threshold } },
    select: { id: true },
    take: 5,
  });

  let recovered = 0;
  for (const r of candidates) {
    // Atomic claim: only one instance re-drives a given stuck run. Re-setting the
    // status touches updatedAt, so a second instance's conditional update misses.
    const claim = await prisma.applicationRun.updateMany({
      where: { id: r.id, status: { in: STUCK_STATUSES as unknown as never[] }, updatedAt: { lt: threshold } },
      data: { status: "SCORING" as never },
    });
    if (claim.count === 1) {
      recovered++;
      logger.warn({ runId: r.id }, "Recovering stuck pipeline run");
      void runApplicationPipeline(r.id).catch((err) =>
        logger.error({ runId: r.id, err: String(err) }, "Stuck-run recovery failed"),
      );
    }
  }
  if (candidates.length) logger.info({ candidates: candidates.length, recovered }, "Stuck-run recovery pass");
  return recovered;
}
