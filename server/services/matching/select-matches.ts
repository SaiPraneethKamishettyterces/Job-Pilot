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

export interface SelectOptions {
  /** Jobs the user has already applied to (any run) — never re-surfaced. */
  alreadyAppliedJobIds?: ReadonlySet<string>;
  /**
   * Diversity: max jobs from one company in the first pass, so the shortlist
   * isn't 30 near-identical roles at the same employer. If the quota isn't filled
   * after the diverse pass, the remaining slots are filled by next-best score
   * regardless of company. 0/undefined disables the cap.
   */
  maxPerCompany?: number;
}

function companyKey(s: ScoredJob): string {
  return s.company.trim().toLowerCase();
}

/**
 * Pick the top `cap` shortlist-eligible jobs by score (highest first), excluding
 * already-applied jobs and (optionally) limiting per-company representation for
 * diversity. The result is the *best* N, ordered best-first.
 */
export function selectTopMatches(
  scored: ScoredJob[],
  cap: number,
  opts: SelectOptions = {},
): ScoredJob[] {
  if (cap <= 0) return [];
  const applied = opts.alreadyAppliedJobIds ?? new Set<string>();

  const eligible = scored
    .filter((s) => s.decision === "SHORTLIST" && !applied.has(s.jobId))
    .slice()
    .sort((a, b) => b.score - a.score);

  const maxPerCompany = opts.maxPerCompany ?? 0;
  if (maxPerCompany <= 0) return eligible.slice(0, cap);

  // Pass 1: diverse — respect the per-company cap.
  const perCompany = new Map<string, number>();
  const picked: ScoredJob[] = [];
  const leftovers: ScoredJob[] = [];
  for (const job of eligible) {
    if (picked.length >= cap) break;
    const key = companyKey(job);
    const used = perCompany.get(key) ?? 0;
    if (used < maxPerCompany) {
      picked.push(job);
      perCompany.set(key, used + 1);
    } else {
      leftovers.push(job);
    }
  }

  // Pass 2: fill any remaining quota with the next-best, ignoring the cap.
  for (const job of leftovers) {
    if (picked.length >= cap) break;
    picked.push(job);
  }

  // Keep the final list ordered best-first.
  return picked.sort((a, b) => b.score - a.score).slice(0, cap);
}
