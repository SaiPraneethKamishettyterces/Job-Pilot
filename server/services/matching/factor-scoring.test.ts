import { describe, it, expect } from "vitest";
import { scoreFactors, DEFAULT_WEIGHTS, type FactorJob, type FactorProfile } from "./factor-scoring.js";

const NOW = Date.UTC(2026, 5, 24, 12, 0, 0); // fixed clock for deterministic recency

const profile: FactorProfile = {
  skills: ["sql", "python", "dbt", "bigquery", "airflow"],
  tools: ["aws"],
  yearsExperience: 3,
  targetRoles: ["Data Engineer", "Analytics Engineer"],
  acceptableAdjacentRoles: ["ETL Developer"],
  domains: ["supply chain", "operations analytics"],
  industries: [],
  remotePreference: "remote",
  places: ["dallas"],
  minSalary: 85000,
  workAuthorization: "STEM OPT",
};

function jobOf(p: Partial<FactorJob>): FactorJob {
  return {
    title: "Data Engineer",
    location: "Remote US",
    isRemote: true,
    remoteType: "remote",
    salaryMin: 100000,
    salaryMax: 140000,
    experienceMin: 2,
    experienceMax: 4,
    workAuthorization: "Sponsorship available",
    description: "Build supply chain data pipelines with SQL, dbt, Airflow.",
    skills: ["sql", "dbt", "airflow"],
    tools: ["aws"],
    atsPlatform: "greenhouse",
    applyUrl: "https://boards.greenhouse.io/x",
    jobUrl: null,
    postedAt: new Date(NOW - 2 * 3_600_000), // 2h ago → fresh
    firstSeenAt: null,
    ...p,
  };
}

describe("scoreFactors", () => {
  it("a strong realistic match scores high (STRONG/APPLY_NOW)", () => {
    const r = scoreFactors(jobOf({}), profile, { nowMs: NOW });
    expect(r.finalScore).toBeGreaterThanOrEqual(80);
    expect(["STRONG_MATCH", "APPLY_NOW"]).toContain(r.statusTier);
    expect(r.reasonCodes).toContain("FRESH_JOB");
    expect(r.reasonCodes).toContain("DIRECT_ATS_APPLY");
  });

  it("returns a per-factor breakdown with all 10 factors in 0-100", () => {
    const r = scoreFactors(jobOf({}), profile, { nowMs: NOW });
    const vals = Object.values(r.factors);
    expect(vals).toHaveLength(10);
    for (const v of vals) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });

  it("high ATS keyword match alone does NOT produce a strong score when fit is weak", () => {
    // Title shares keywords but role/experience/location are poor; ATS is only 12%.
    const r = scoreFactors(
      jobOf({
        title: "Frontend Engineer",
        experienceMin: 10,
        experienceMax: 15,
        isRemote: false,
        remoteType: "onsite",
        location: "New York, NY",
        salaryMax: 60000,
        skills: ["sql", "python", "dbt"], // keyword overlap high
      }),
      profile,
      { nowMs: NOW },
    );
    expect(r.finalScore).toBeLessThan(70);
  });

  it("weights sum to 100 (spec)", () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b, 0);
    expect(sum).toBe(100);
  });

  it("stale posting loses the recency factor", () => {
    const fresh = scoreFactors(jobOf({}), profile, { nowMs: NOW });
    const stale = scoreFactors(jobOf({ postedAt: new Date(NOW - 40 * 24 * 3_600_000) }), profile, { nowMs: NOW });
    expect(stale.factors.recency).toBeLessThan(fresh.factors.recency);
  });

  it("blends an LLM holistic score into the soft factors", () => {
    const low = scoreFactors(jobOf({}), profile, { nowMs: NOW, llmHolistic: 10 });
    const high = scoreFactors(jobOf({}), profile, { nowMs: NOW, llmHolistic: 100 });
    expect(high.factors.skill).toBeGreaterThan(low.factors.skill);
  });
});
