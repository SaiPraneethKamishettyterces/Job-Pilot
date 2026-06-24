import { describe, it, expect } from "vitest";
import { extractKeywords, keywordCoverage, compareCoverage } from "./coverage.js";
import { RESUME_JD_PAIRS } from "./__fixtures__/resume-jd-pairs.js";

describe("keyword coverage metric", () => {
  it("extracts multi-word tech phrases and drops stopwords", () => {
    const kw = extractKeywords("We need machine learning and strong Python skills for the team.");
    expect(kw.has("machine learning")).toBe(true);
    expect(kw.has("python")).toBe(true);
    // stopwords / filler excluded
    expect(kw.has("the")).toBe(false);
    expect(kw.has("team")).toBe(false);
    expect(kw.has("skills")).toBe(false);
    // the phrase's component words are not double-counted as bare tokens
    expect(kw.has("learning")).toBe(false);
  });

  it("scores coverage as the fraction of JD keywords present in the resume", () => {
    const jd = "Need Python, Spark and Kafka.";
    const res = keywordCoverage("Built pipelines with Python and Spark.", jd);
    expect(res.covered).toContain("python");
    expect(res.covered).toContain("spark");
    expect(res.missing).toContain("kafka");
    expect(res.score).toBeCloseTo(2 / 3, 5);
  });

  it("reports positive uplift when the tailored text adds JD keywords", () => {
    const jd = "Looking for Spark, Kafka, dbt and Snowflake experience.";
    const base = "Experienced engineer who built pipelines.";
    const tailored = "Experienced engineer using Spark, Kafka, dbt and Snowflake.";
    const cmp = compareCoverage(base, tailored, jd);
    expect(cmp.uplift).toBeGreaterThan(0);
    expect(cmp.gained).toEqual(expect.arrayContaining(["spark", "kafka", "dbt", "snowflake"]));
  });

  it("every fixture's base resume leaves JD keywords uncovered (room to tailor)", () => {
    for (const pair of RESUME_JD_PAIRS) {
      const base = keywordCoverage(pair.baseResumeText, pair.jobDescription);
      expect(base.total).toBeGreaterThan(0);
      expect(base.score).toBeLessThan(1); // tailoring has something to improve
    }
  });
});
