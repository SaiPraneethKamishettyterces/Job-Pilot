import { PRICE_PER_MTOK, FALLBACK_PRICE } from "./model-config.js";

export interface TokenSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUSD: number;
}

// Provider-agnostic usage shape. Anthropic's `response.usage` satisfies this
// structurally; the OpenAI-compatible provider maps prompt/completion tokens in.
export interface UsageLike {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function summarizeUsage(model: string, usage: UsageLike): TokenSummary {
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
