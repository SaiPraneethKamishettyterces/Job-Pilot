import { logger } from "./logger.js";

// Single integration point for external error tracking (Sentry / GCP Error
// Reporting / Datadog). Today it logs with a stable shape that GCP Error
// Reporting can ingest from Cloud Logging; swap the body to call a real SDK
// without touching call sites.
//
// To wire Sentry: initialize the SDK at boot and call Sentry.captureException
// here. To wire GCP Error Reporting: it auto-collects logged Errors with a stack.
export function captureException(err: unknown, context: Record<string, unknown> = {}): void {
  const error = err instanceof Error ? err : new Error(String(err));
  logger.error(
    { err: error.message, stack: error.stack, ...context, "@type": "error" },
    "captured exception",
  );
}
