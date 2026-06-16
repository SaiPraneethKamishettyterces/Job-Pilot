import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import type { TokenSummary } from "./token-tracker.js";

// Persist a Claude call's token/cost summary to AIUsageEvent. Governance (CLAUDE.md)
// requires every model call to feed the cost ledger. Best-effort: a logging
// failure must never break the request that produced real work.
export async function recordUsage(args: {
  userId: string;
  featureName: string;
  usage: TokenSummary;
  runId?: string | null;
  applicationId?: string | null;
}): Promise<void> {
  try {
    await prisma.aIUsageEvent.create({
      data: {
        userId: args.userId,
        runId: args.runId ?? null,
        applicationId: args.applicationId ?? null,
        featureName: args.featureName,
        model: args.usage.model,
        inputTokens: args.usage.inputTokens,
        outputTokens: args.usage.outputTokens,
        cacheReadTokens: args.usage.cacheReadTokens,
        estimatedCostUsd: args.usage.estimatedCostUSD,
      },
    });
  } catch (err) {
    logger.warn(
      { err: String(err), feature: args.featureName, userId: args.userId },
      "Failed to record AI usage event",
    );
  }
}
