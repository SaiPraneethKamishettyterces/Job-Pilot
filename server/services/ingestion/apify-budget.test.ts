import { describe, it, expect } from "vitest";
import { estimateRunCostUsd } from "./apify-budget.js";

describe("estimateRunCostUsd", () => {
  it("prefers the actor-reported usageTotalUsd when present", () => {
    expect(estimateRunCostUsd({ usageTotalUsd: 0.42 }, 100)).toBe(0.42);
  });

  it("falls back to a per-result rate when usage is missing", () => {
    // config default fallbackUsdPerResult = 0.01
    expect(estimateRunCostUsd(null, 50)).toBeCloseTo(0.5, 5);
    expect(estimateRunCostUsd({ usageTotalUsd: null }, 10)).toBeCloseTo(0.1, 5);
  });

  it("treats zero/negative reported usage as missing", () => {
    expect(estimateRunCostUsd({ usageTotalUsd: 0 }, 20)).toBeCloseTo(0.2, 5);
  });
});
