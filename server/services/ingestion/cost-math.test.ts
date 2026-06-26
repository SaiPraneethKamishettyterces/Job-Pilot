import { describe, it, expect } from "vitest";
import { amortizeUnitCost, estimateEmbedCostUsd, dedupRatio } from "./cost-math.js";

describe("amortizeUnitCost", () => {
  it("splits a call's spend evenly across returned items", () => {
    expect(amortizeUnitCost(0.3, 30)).toBeCloseTo(0.01, 6);
  });
  it("is 0 when the call cost nothing", () => {
    expect(amortizeUnitCost(0, 50)).toBe(0);
  });
  it("never divides by zero (a call returning nothing has unit cost 0)", () => {
    // costUsd>0 with 0 items: clamp denominator to 1 so it doesn't blow up.
    expect(amortizeUnitCost(0.05, 0)).toBeCloseTo(0.05, 6);
  });
  it("sum of per-item costs never exceeds the call cost", () => {
    const cost = 0.37;
    const items = 13;
    expect(amortizeUnitCost(cost, items) * items).toBeCloseTo(cost, 6);
  });
});

describe("estimateEmbedCostUsd", () => {
  it("is 0 on a free-tier rate regardless of length", () => {
    expect(estimateEmbedCostUsd(12000, 0)).toBe(0);
  });
  it("scales with text length at the given $/1M-token rate", () => {
    // 4000 chars ≈ 1000 tokens; at $0.02/1M tokens → $0.00002.
    expect(estimateEmbedCostUsd(4000, 0.02)).toBeCloseTo(0.00002, 9);
  });
  it("is 0 for empty text", () => {
    expect(estimateEmbedCostUsd(0, 1)).toBe(0);
  });
});

describe("dedupRatio", () => {
  it("returns the duplicate fraction", () => {
    expect(dedupRatio(20, 50)).toBeCloseTo(0.4, 6);
  });
  it("is null when nothing was scraped (avoid divide-by-zero)", () => {
    expect(dedupRatio(0, 0)).toBeNull();
  });
});
