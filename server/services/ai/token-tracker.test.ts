import { describe, it, expect } from "vitest";
import type { Usage } from "@anthropic-ai/sdk/resources/messages.js";
import { summarizeUsage } from "./token-tracker.js";
import { MODELS } from "./model-config.js";

function usage(input: number, output: number, cacheRead = 0): Usage {
  return {
    input_tokens: input,
    output_tokens: output,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: 0,
  } as Usage;
}

describe("summarizeUsage", () => {
  it("prices opus at $5/$25 per Mtok", () => {
    expect(summarizeUsage(MODELS.opus, usage(1_000_000, 0)).estimatedCostUSD).toBe(5);
    expect(summarizeUsage(MODELS.opus, usage(0, 1_000_000)).estimatedCostUSD).toBe(25);
  });

  it("prices sonnet at $3/$15 per Mtok", () => {
    expect(summarizeUsage(MODELS.sonnet, usage(1_000_000, 0)).estimatedCostUSD).toBe(3);
  });

  it("prices haiku by its exact dated id (regression: was falling back to opus rates)", () => {
    // MODELS.haiku is "claude-haiku-4-5-20251001" — must price at $1/Mtok input, not $5.
    expect(summarizeUsage(MODELS.haiku, usage(1_000_000, 0)).estimatedCostUSD).toBe(1);
  });

  it("discounts cache reads to 10% of input price", () => {
    // 1M cached input at opus: 1M * $5 * 0.10 / 1M = $0.50
    expect(summarizeUsage(MODELS.opus, usage(1_000_000, 0, 1_000_000)).estimatedCostUSD).toBe(0.5);
  });

  it("falls back to a conservative price for unknown models", () => {
    expect(summarizeUsage("made-up-model", usage(1_000_000, 0)).estimatedCostUSD).toBe(5);
  });
});
