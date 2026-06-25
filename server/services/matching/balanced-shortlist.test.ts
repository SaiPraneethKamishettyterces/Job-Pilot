import { describe, it, expect } from "vitest";
import { mergeBalanced } from "./balanced-shortlist.js";
import type { ScoredJob } from "./select-matches.js";

function sj(id: string, score: number, source: string, canonicalKey?: string): ScoredJob {
  return {
    jobId: id,
    score,
    decision: "SHORTLIST",
    company: `Co-${id}`,
    title: `Role ${id}`,
    jobUrl: null,
    atsPlatform: source,
    canonicalKey: canonicalKey ?? `key-${id}`,
  };
}

describe("mergeBalanced", () => {
  it("produces a ~50/50 split between Apify and free buckets", () => {
    const apify = [sj("a1", 90, "linkedin"), sj("a2", 88, "indeed"), sj("a3", 80, "hiringcafe")];
    const free = [sj("f1", 95, "greenhouse"), sj("f2", 92, "lever"), sj("f3", 70, "ashby")];
    const out = mergeBalanced(apify, free, 4, { ratio: 0.5 });
    expect(out).toHaveLength(4);
    const fromApify = out.filter((s) => ["linkedin", "indeed", "hiringcafe"].includes(s.atsPlatform!));
    expect(fromApify).toHaveLength(2); // 50% of 4
  });

  it("Test 5: same job across sources collapses by canonicalKey (no duplication)", () => {
    // The SAME role on LinkedIn and Greenhouse shares a canonicalKey.
    const apify = [sj("li", 90, "linkedin", "acme|data engineer|remote")];
    const free = [sj("gh", 88, "greenhouse", "acme|data engineer|remote"), sj("f2", 85, "lever", "other|x|y")];
    const out = mergeBalanced(apify, free, 4, { ratio: 0.5 });
    const keys = out.map((s) => s.canonicalKey);
    // canonicalKey appears once; the LinkedIn copy was claimed first.
    expect(keys.filter((k) => k === "acme|data engineer|remote")).toHaveLength(1);
    expect(out.find((s) => s.canonicalKey === "acme|data engineer|remote")!.jobId).toBe("li");
  });

  it("backfills from free when the Apify bucket is short", () => {
    const apify = [sj("a1", 90, "linkedin")]; // only 1 apify available
    const free = [sj("f1", 95, "greenhouse"), sj("f2", 92, "lever"), sj("f3", 80, "ashby")];
    const out = mergeBalanced(apify, free, 4, { ratio: 0.5 });
    expect(out).toHaveLength(4); // 1 apify + 3 free (backfilled)
  });

  it("ignores non-shortlisted candidates", () => {
    const apify = [{ ...sj("a1", 99, "linkedin"), decision: "SKIP" as const }];
    const free = [sj("f1", 70, "greenhouse")];
    const out = mergeBalanced(apify, free, 4);
    expect(out.map((s) => s.jobId)).toEqual(["f1"]);
  });
});
