import { describe, it, expect } from "vitest";
import { evaluateGates, type GateJob, type GateProfile } from "./hard-gates.js";
import { NEGATIVE_CODES } from "./reason-codes.js";

const baseProfile: GateProfile = {
  yearsExperience: 3,
  targetRoles: ["Data Engineer", "Analytics Engineer", "BI Engineer"],
  acceptableAdjacentRoles: ["ETL Developer", "Cloud Data Engineer"],
  excludedRoles: ["Director", "Principal", "Staff", "Manager"],
  seniorityBand: "early_mid",
  employmentTypePreference: ["full_time"],
  remotePreference: "remote",
  places: ["dallas"],
  minSalary: 85000,
  requiresSponsorship: true,
};

function jobOf(p: Partial<GateJob>): GateJob {
  return {
    title: "Data Engineer",
    location: null,
    isRemote: true,
    remoteType: "remote",
    employmentType: "full_time",
    seniority: "mid",
    salaryMin: null,
    salaryMax: null,
    experienceMin: null,
    experienceMax: null,
    workAuthorization: null,
    description: null,
    ...p,
  };
}

describe("evaluateGates", () => {
  it("Test 1: high-ATS but extreme experience mismatch → reject (3yr vs 12+yr)", () => {
    const g = evaluateGates(jobOf({ title: "Staff Data Engineer", experienceMin: 12 }), baseProfile);
    expect(g.passed).toBe(false);
    // Staff title (seniority) AND 12+yr (experience) both fail.
    expect(g.failedGates).toContain(NEGATIVE_CODES.EXPERIENCE_TOO_LOW);
    expect(g.failedGates).toContain(NEGATIVE_CODES.SENIORITY_TOO_HIGH);
  });

  it("Test 2: good realistic match passes (3yr, Analytics Engineer 2-4yr, remote)", () => {
    const g = evaluateGates(
      jobOf({ title: "Analytics Engineer", experienceMin: 2, experienceMax: 4 }),
      baseProfile,
    );
    expect(g.passed).toBe(true);
    expect(g.failedGates).toEqual([]);
  });

  it("Test 3: wrong location (onsite NYC, candidate Dallas/remote) → reject", () => {
    const g = evaluateGates(
      jobOf({ title: "Data Engineer", isRemote: false, remoteType: "onsite", location: "New York, NY" }),
      // candidate accepts dallas metro OR remote
      { ...baseProfile, remotePreference: "hybrid" },
    );
    expect(g.passed).toBe(false);
    expect(g.failedGates).toContain(NEGATIVE_CODES.LOCATION_MISMATCH);
  });

  it("Test 4: work-authorization conflict (no sponsorship) → reject", () => {
    const g = evaluateGates(
      jobOf({ description: "Must be a US citizen. We do not provide visa sponsorship." }),
      baseProfile,
    );
    expect(g.passed).toBe(false);
    expect(g.failedGates).toContain(NEGATIVE_CODES.WORK_AUTH_CONFLICT);
  });

  it("rejects a clearly different role family", () => {
    const g = evaluateGates(jobOf({ title: "Product Manager" }), baseProfile);
    expect(g.passed).toBe(false);
    expect(g.failedGates).toContain(NEGATIVE_CODES.ROLE_MISMATCH);
  });

  it("rejects an excluded role explicitly", () => {
    const g = evaluateGates(jobOf({ title: "Engineering Manager" }), baseProfile);
    expect(g.failedGates).toContain(NEGATIVE_CODES.SENIORITY_TOO_HIGH);
  });

  it("rejects wrong employment type (contract when full_time preferred)", () => {
    const g = evaluateGates(jobOf({ employmentType: "contract" }), baseProfile);
    expect(g.failedGates).toContain(NEGATIVE_CODES.EMPLOYMENT_TYPE_MISMATCH);
  });

  it("rejects salary below the hard minimum", () => {
    const g = evaluateGates(jobOf({ salaryMax: 60000 }), baseProfile);
    expect(g.failedGates).toContain(NEGATIVE_CODES.SALARY_TOO_LOW);
  });

  it("passes when experience requirement is unknown (no false reject)", () => {
    const g = evaluateGates(jobOf({ experienceMin: null }), baseProfile);
    expect(g.passed).toBe(true);
  });

  it("8+yr job with <4yr candidate → reject", () => {
    const g = evaluateGates(jobOf({ experienceMin: 8 }), { ...baseProfile, yearsExperience: 3 });
    expect(g.failedGates).toContain(NEGATIVE_CODES.EXPERIENCE_TOO_LOW);
  });
});
