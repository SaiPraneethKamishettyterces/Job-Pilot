import { logger } from "../lib/logger.js";
import { config } from "../lib/config.js";
import { processRetryBatch } from "../services/application/retry-service.js";
import { recoverStuckRuns } from "./run-recovery.js";

// Lightweight in-process scheduler that periodically retries applications which
// failed during document generation. Enabled by config (off in test). For a
// horizontally-scaled production deployment this would move to a real job queue
// (e.g. Cloud Tasks / BullMQ); the service layer (retry-service) is queue-agnostic.

let timer: NodeJS.Timeout | null = null;

export function startRetryWorker(): void {
  if (!config.automation.retry.enabled) {
    logger.info("Retry worker disabled (config.automation.retry.enabled=false)");
    return;
  }
  if (timer) return; // already running

  const intervalMs = Math.max(1, config.automation.retry.intervalMinutes) * 60_000;
  logger.info({ intervalMinutes: config.automation.retry.intervalMinutes }, "Retry worker started");

  timer = setInterval(() => {
    processRetryBatch().catch((err) => {
      logger.error({ err: String(err) }, "Retry worker batch error");
    });
    recoverStuckRuns().catch((err) => {
      logger.error({ err: String(err) }, "Stuck-run recovery error");
    });
  }, intervalMs);
  // Don't keep the process alive solely for this timer.
  timer.unref?.();
}

export function stopRetryWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
