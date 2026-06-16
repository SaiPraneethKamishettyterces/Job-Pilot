import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { generateApplicationDocuments } from "./application-generator.js";

// Retry handling for applications that failed during document generation.
//
// The generation pipeline marks failures as FAILED (technical doc-gen error).
// This service re-runs generation for such applications, bounded by a per-app
// attempt cap (Application.retryCount). It is invoked both manually (API) and by
// a periodic background worker (retry-worker.ts).

// Statuses eligible for an automatic retry.
const RETRYABLE = ["FAILED", "FAILED_TECHNICAL"] as const;

export interface RetryResult {
  retried: boolean;
  status?: string;
  reason: string;
  retryCount?: number;
}

/** Retry a single application's document generation, respecting the attempt cap. */
export async function retryApplication(id: string): Promise<RetryResult> {
  const app = await prisma.application.findUnique({ where: { id } });
  if (!app) return { retried: false, reason: "Application not found" };

  if (!RETRYABLE.includes(app.status as (typeof RETRYABLE)[number])) {
    return { retried: false, reason: `Status ${app.status} is not retryable` };
  }

  const max = config.automation.retry.maxAttempts;
  if (app.retryCount >= max) {
    await prisma.applicationEvent.create({
      data: {
        applicationId: id,
        type: "retry_exhausted",
        description: `Retry limit reached (${app.retryCount}/${max})`,
      },
    });
    return { retried: false, reason: `Retry limit reached (${app.retryCount}/${max})`, retryCount: app.retryCount };
  }

  const attempt = app.retryCount + 1;
  await prisma.application.update({
    where: { id },
    data: { retryCount: attempt, status: "SHORTLISTED" as never, failureReason: null },
  });
  await prisma.applicationEvent.create({
    data: { applicationId: id, type: "retry_started", description: `Retry attempt ${attempt}/${max}` },
  });

  try {
    const gen = await generateApplicationDocuments(id);
    await prisma.applicationEvent.create({
      data: { applicationId: id, type: "retry_succeeded", description: `Regenerated documents (status ${gen.status})` },
    });
    logger.info({ applicationId: id, attempt, status: gen.status }, "Application retry succeeded");
    return { retried: true, status: gen.status, reason: "Documents regenerated", retryCount: attempt };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await prisma.application.update({
      where: { id },
      data: { status: "FAILED" as never, failureReason: msg },
    });
    await prisma.applicationEvent.create({
      data: { applicationId: id, type: "retry_failed", description: msg },
    });
    logger.warn({ applicationId: id, attempt, err: msg }, "Application retry failed");
    return { retried: false, status: "FAILED", reason: msg, retryCount: attempt };
  }
}

/** Find failed applications still under the attempt cap (oldest first). */
export async function findRetryableApplications(limit: number): Promise<string[]> {
  const rows = await prisma.application.findMany({
    where: {
      status: { in: RETRYABLE as unknown as string[] as never[] },
      retryCount: { lt: config.automation.retry.maxAttempts },
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Process one batch of retryable applications. Returns the number retried. */
export async function processRetryBatch(): Promise<number> {
  const ids = await findRetryableApplications(config.automation.retry.batchSize);
  let retried = 0;
  for (const id of ids) {
    const result = await retryApplication(id);
    if (result.retried) retried++;
  }
  if (ids.length) logger.info({ candidates: ids.length, retried }, "Retry batch processed");
  return retried;
}
