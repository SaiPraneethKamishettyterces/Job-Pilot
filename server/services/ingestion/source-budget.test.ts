import { describe, it, expect } from "vitest";
import {
  computeClusterSourceLimit,
  costPerHighMatchJob,
  nextApifyBudget,
  DEFAULT_REBALANCE,
} from "./source-budget.js";

describe("computeClusterSourceLimit", () => {
  it("matches the spec example (30 + 8*20 + 20 = 210)", () => {
    expect(
      computeClusterSourceLimit({ base: 30, demandWeight: 8, candidateCount: 20, scarcityBoost: 20, lowYieldPenalty: 0 }),
    ).toBe(210);
  });
  it("never goes negative", () => {
    expect(
      computeClusterSourceLimit({ base: 0, demandWeight: 0, candidateCount: 0, scarcityBoost: 0, lowYieldPenalty: 100 }),
    ).toBe(0);
  });
});

describe("costPerHighMatchJob", () => {
  it("is cost / high-match count", () => {
    expect(costPerHighMatchJob({ source: "x", costUsd: 1.0, jobsHighMatch: 20 })).toBeCloseTo(0.05, 5);
  });
  it("is Infinity when spend produced no high-match jobs", () => {
    expect(costPerHighMatchJob({ source: "x", costUsd: 2, jobsHighMatch: 0 })).toBe(Infinity);
  });
});

describe("nextApifyBudget (yield feedback)", () => {
  it("raises budget for a low cost-per-high-match source", () => {
    const next = nextApifyBudget("indeed", 100, { source: "indeed", costUsd: 1, jobsHighMatch: 40 }); // 0.025 < good
    expect(next).toBe(125);
  });
  it("cuts budget for an expensive source", () => {
    const next = nextApifyBudget("linkedin", 100, { source: "linkedin", costUsd: 10, jobsHighMatch: 5 }); // 2.0 > bad
    expect(next).toBe(75);
  });
  it("cuts hard when spend yields zero high matches", () => {
    const next = nextApifyBudget("linkedin", 100, { source: "linkedin", costUsd: 3, jobsHighMatch: 0 });
    expect(next).toBe(50); // -step*2
  });
  it("leaves budget unchanged with no data", () => {
    expect(nextApifyBudget("indeed", 80, { source: "indeed", costUsd: 0, jobsHighMatch: 0 })).toBe(80);
  });
  it("keeps HiringCafe above its floor", () => {
    const next = nextApifyBudget("hiringcafe", 60, { source: "hiringcafe", costUsd: 5, jobsHighMatch: 0 });
    expect(next).toBeGreaterThanOrEqual(DEFAULT_REBALANCE.hiringCafeFloor);
  });
  it("respects min/max bounds", () => {
    const hi = nextApifyBudget("indeed", 500, { source: "indeed", costUsd: 1, jobsHighMatch: 100 });
    expect(hi).toBeLessThanOrEqual(DEFAULT_REBALANCE.maxBudget);
  });
});
