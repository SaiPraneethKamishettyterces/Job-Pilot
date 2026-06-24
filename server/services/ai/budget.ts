import { prisma } from "../../lib/db.js";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { MODELS } from "./model-config.js";

// Anthropic spend guard (Issue #77). A hard USD ceiling on cumulative Claude
// spend so testing/runs can't burn all credits. Enforced BEFORE each Anthropic
// call against the recorded AIUsageEvent ledger. Set ANTHROPIC_BUDGET_USD; <= 0
// disables the cap.

const ANTHROPIC_MODELS = [MODELS.opus, MODELS.sonnet, MODELS.haiku];

export class AnthropicBudgetError extends Error {
  constructor(public spent: number, public cap: number) {
    super(
      `Anthropic budget exhausted: $${spent.toFixed(4)} spent ≥ $${cap.toFixed(2)} cap ` +
        `(ANTHROPIC_BUDGET_USD). Raise the cap or rotate to the local provider.`,
    );
    this.name = "AnthropicBudgetError";
  }
}

/** Sum of recorded Anthropic spend (USD) across all AIUsageEvent rows. */
export async function anthropicSpentUsd(): Promise<number> {
  const agg = await prisma.aIUsageEvent.aggregate({
    _sum: { estimatedCostUsd: true },
    where: { model: { in: ANTHROPIC_MODELS } },
  });
  return agg._sum.estimatedCostUsd ?? 0;
}

/**
 * Throw if cumulative Anthropic spend already meets/exceeds the configured cap.
 * Called before every Anthropic request. No-op when the cap is <= 0 (disabled).
 */
export async function assertWithinAnthropicBudget(): Promise<void> {
  const cap = config.ai.anthropicBudgetUsd;
  if (!cap || cap <= 0) return; // disabled
  const spent = await anthropicSpentUsd();
  if (spent >= cap) {
    logger.warn({ spent, cap }, "anthropic_budget_exhausted");
    throw new AnthropicBudgetError(spent, cap);
  }
}
