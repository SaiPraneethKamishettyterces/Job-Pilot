import type { Usage } from "@anthropic-ai/sdk/resources/messages.js";
import { PRICE_PER_MTOK, FALLBACK_PRICE } from "./model-config.js";

export interface TokenSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUSD: number;
}

export function summarizeUsage(model: string, usage: Usage): TokenSummary {
  const prices = PRICE_PER_MTOK[model] ?? FALLBACK_PRICE;
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;

  // Cache reads are billed at 10% of input price.
  const costUSD =
    ((inputTokens - cacheRead) * prices.input +
      cacheRead * prices.input * 0.1 +
      outputTokens * prices.output) /
    1_000_000;

  return {
    model,
    inputTokens,
    outputTokens,
    cacheReadTokens: cacheRead,
    cacheCreationTokens: cacheCreate,
    estimatedCostUSD: parseFloat(costUSD.toFixed(6)),
  };
}
