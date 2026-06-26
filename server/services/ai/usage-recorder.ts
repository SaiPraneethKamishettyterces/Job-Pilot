import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import type { TokenSummary } from "./token-tracker.js";

// Persist a Claude call's token/cost summary to AIUsageEvent. Governance (CLAUDE.md)
// requires every model call to feed the cost ledger. Best-effort: a logging
// failure must never break the request that produced real work.
export interface UsageBreakdown {
  /** Input token estimate per prompt component, apportioned to the billed input total. */
  input: Record<string, number>;
  /** Output token estimate per generated section, apportioned to the billed output total. */
  output: Record<string, number>;
}

export async function recordUsage(args: {
  userId: string;
  featureName: string;
  usage: TokenSummary;
  runId?: string | null;
  applicationId?: string | null;
  breakdown?: UsageBreakdown | null;
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
        breakdownJson: args.breakdown ? (args.breakdown as unknown as object) : undefined,
      },
    });
  } catch (err) {
    logger.warn(
      { err: String(err), feature: args.featureName, userId: args.userId },
      "Failed to record AI usage event",
    );
  }
}
