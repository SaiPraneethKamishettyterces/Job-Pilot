import { describe, it, expect } from "vitest";
import { fallbackContent, extractSkills } from "./tailor-service.js";
import { resumeContentSchema, atsAnalysisSchema } from "./resume-content.js";
import { RESUME_JD_PAIRS } from "./__fixtures__/resume-jd-pairs.js";

// Issue #77 AC#6 — parser/tailoring guarantees that are deterministic (no model):
// schema conformance, the no-fabrication guardrail, and robustness of the
// secondary analysis block.

describe("tailoring — no-fabrication & schema (deterministic path)", () => {
  it("fallback output always conforms to the resume content schema", () => {
    for (const pair of RESUME_JD_PAIRS) {
      const raw = fallbackContent(pair.baseResumeText, pair.jobDescription, pair.targetRole);
      const parsed = resumeContentSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
    }
  });

  it("never invents an employer — fallback experience carries no fabricated company", () => {
    const pair = RESUME_JD_PAIRS[0];
    const content = resumeContentSchema.parse(
      fallbackContent(pair.baseResumeText, pair.jobDescription, pair.targetRole),
    );
    for (const role of content.experience) {
      // Deterministic path must not fabricate a company name.
      expect(role.company).toBe("");
    }
  });

  it("only surfaces JD skills that are literally in the job description (no invented skills)", () => {
    const jd = "We need Python, Spark and Kafka. Bonus: Terraform.";
    const skills = extractSkills(jd);
    // every surfaced skill literally appears in the JD
    for (const s of skills) expect(jd.toLowerCase()).toContain(s);
    expect(skills).toContain("python");
    expect(skills).toContain("spark");
    expect(skills).toContain("kafka");
    expect(skills).toContain("terraform");
    // a skill NOT in the JD is never invented
    expect(skills).not.toContain("kubernetes");
  });

  it("fixtures are honest: every ground-truth skill is present in the base resume", () => {
    for (const pair of RESUME_JD_PAIRS) {
      const base = pair.baseResumeText.toLowerCase();
      for (const skill of pair.groundTruthSkills) expect(base).toContain(skill);
    }
  });
});

describe("ats analysis robustness", () => {
  it("yields safe defaults from an empty object", () => {
    const a = atsAnalysisSchema.parse({});
    expect(a.changes_made).toEqual([]);
    expect(a.matched_keywords).toEqual([]);
  });

  it("rejects a malformed analysis (object-valued changes_made) without throwing via safeParse", () => {
    // This is exactly the shape a model can emit that previously crashed tailoring;
    // tailorResumeContent now safeParses and falls back to defaults instead.
    const bad = { changes_made: [{ note: "reordered skills" }, { note: "added keywords" }] };
    expect(atsAnalysisSchema.safeParse(bad).success).toBe(false);
  });
});
