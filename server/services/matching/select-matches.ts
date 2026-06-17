// Pure, testable selection of the best matches from a scored job pool.
// Kept separate from the pipeline so it can be unit-tested without a DB.

export interface ScoredJob {
  jobId: string;
  score: number;
  decision: "SHORTLIST" | "REVIEW" | "SKIP";
  company: string;
  title: string;
  jobUrl: string | null;
  atsPlatform: string | null;
}

/**
 * Pick the top `cap` shortlist-eligible jobs by score (highest first), excluding
 * any the user has already applied to. This makes the shortlist the *best* N, not
 * the first N discovered.
 */
export function selectTopMatches(
  scored: ScoredJob[],
  cap: number,
  alreadyAppliedJobIds: ReadonlySet<string> = new Set(),
): ScoredJob[] {
  if (cap <= 0) return [];
  return scored
    .filter((s) => s.decision === "SHORTLIST" && !alreadyAppliedJobIds.has(s.jobId))
    .slice() // don't mutate caller's array
    .sort((a, b) => b.score - a.score)
    .slice(0, cap);
}
