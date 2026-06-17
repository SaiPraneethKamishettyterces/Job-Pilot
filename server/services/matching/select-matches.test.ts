import { describe, it, expect } from "vitest";
import { selectTopMatches, type ScoredJob } from "./select-matches.js";

function job(
  id: string,
  score: number,
  decision: ScoredJob["decision"] = "SHORTLIST",
  company = `Co-${id}`,
): ScoredJob {
  return { jobId: id, score, decision, company, title: `Role ${id}`, jobUrl: null, atsPlatform: null };
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
    const top = selectTopMatches(scored, 3, { alreadyAppliedJobIds: new Set(["a"]) });
    expect(top.map((j) => j.jobId)).toEqual(["b", "c"]);
  });

  it("does not mutate the caller's array", () => {
    const scored = [job("a", 70), job("b", 95)];
    const before = scored.map((j) => j.jobId);
    selectTopMatches(scored, 2);
    expect(scored.map((j) => j.jobId)).toEqual(before);
  });

  it("caps per-company in the diverse pass, then fills the quota by score", () => {
    // 4 jobs at Acme (high scores) + 1 at Globex. cap=3, maxPerCompany=2.
    const scored = [
      job("a1", 99, "SHORTLIST", "Acme"),
      job("a2", 98, "SHORTLIST", "Acme"),
      job("a3", 97, "SHORTLIST", "Acme"),
      job("a4", 96, "SHORTLIST", "Acme"),
      job("g1", 50, "SHORTLIST", "Globex"),
    ];
    const top = selectTopMatches(scored, 3, { maxPerCompany: 2 });
    // 2 Acme (top scores) + Globex fills the 3rd slot for diversity.
    expect(top.filter((j) => j.company === "Acme")).toHaveLength(2);
    expect(top.map((j) => j.jobId)).toContain("g1");
  });

  it("fills remaining slots from the same company when no diversity is available", () => {
    const scored = [
      job("a1", 99, "SHORTLIST", "Acme"),
      job("a2", 98, "SHORTLIST", "Acme"),
      job("a3", 97, "SHORTLIST", "Acme"),
    ];
    // Only one company exists → cap must still be filled despite maxPerCompany.
    expect(selectTopMatches(scored, 3, { maxPerCompany: 2 })).toHaveLength(3);
  });
});
