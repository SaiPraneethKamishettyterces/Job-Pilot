import type { Usage } from "@anthropic-ai/sdk/resources/messages.js";

const PRICE_PER_MTK = {
  "claude-opus-4-8":   { input: 5.00,  output: 25.00 },
  "claude-sonnet-4-6": { input: 3.00,  output: 15.00 },
  "claude-haiku-4-5":  { input: 1.00,  output:  5.00 },
} as const;

type KnownModel = keyof typeof PRICE_PER_MTK;

export interface TokenSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUSD: number;
}

export function summarizeUsage(model: string, usage: Usage): TokenSummary {
  const prices = PRICE_PER_MTK[model as KnownModel] ?? { input: 5.0, output: 25.0 };
  const inputTokens = usage.input_tokens;
  const outputTokens = usage.output_tokens;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreate = usage.cache_creation_input_tokens ?? 0;

  // Cache reads are billed at 10% of input price
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
