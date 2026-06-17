import { describe, it, expect } from "vitest";
import { selectTopMatches, type ScoredJob } from "./select-matches.js";

function job(id: string, score: number, decision: ScoredJob["decision"] = "SHORTLIST"): ScoredJob {
  return { jobId: id, score, decision, company: `Co-${id}`, title: `Role ${id}`, jobUrl: null, atsPlatform: null };
}

describe("selectTopMatches", () => {
  it("returns the highest-scoring shortlisted jobs, best first", () => {
    const scored = [job("a", 70), job("b", 95), job("c", 82)];
    const top = selectTopMatches(scored, 2);
    expect(top.map((j) => j.jobId)).toEqual(["b", "c"]);
  });

  it("only includes SHORTLIST decisions (ignores REVIEW/SKIP even if high)", () => {
    const scored = [job("a", 99, "REVIEW"), job("b", 60, "SHORTLIST"), job("c", 98, "SKIP")];
    const top = selectTopMatches(scored, 5);
    expect(top.map((j) => j.jobId)).toEqual(["b"]);
  });

  it("respects the cap", () => {
    const scored = [job("a", 90), job("b", 88), job("c", 86), job("d", 84)];
    expect(selectTopMatches(scored, 2)).toHaveLength(2);
  });

  it("returns nothing when cap <= 0", () => {
    expect(selectTopMatches([job("a", 90)], 0)).toEqual([]);
    expect(selectTopMatches([job("a", 90)], -3)).toEqual([]);
  });

  it("excludes jobs the user already applied to", () => {
    const scored = [job("a", 95), job("b", 90), job("c", 85)];
    const top = selectTopMatches(scored, 3, new Set(["a"]));
    expect(top.map((j) => j.jobId)).toEqual(["b", "c"]);
  });

  it("does not mutate the caller's array", () => {
    const scored = [job("a", 70), job("b", 95)];
    const before = scored.map((j) => j.jobId);
    selectTopMatches(scored, 2);
    expect(scored.map((j) => j.jobId)).toEqual(before);
  });
});
