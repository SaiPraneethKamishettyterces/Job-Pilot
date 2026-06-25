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
  /** Posting time used for the freshness tiebreak + fresh-reserve N-strategy. */
  postedAt?: Date | null;
  /** Source-agnostic key for cross-source dedup in the 50/50 balanced merge. */
  canonicalKey?: string | null;
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
  /**
   * N-strategy: reserve this fraction of the cap for the freshest eligible jobs
   * (posted within `freshHours`) so a slate isn't all high-score-but-stale roles.
   * 0 disables. Default 0.15.
   */
  freshReserveRatio?: number;
  freshHours?: number; // what counts as "fresh" for the reserve (default 24)
  nowMs?: number; // injectable clock for tests
}

function companyKey(s: ScoredJob): string {
  return s.company.trim().toLowerCase();
}

// Direct-ATS / company apply paths are the most automation-friendly (spec Pt 8/13).
const APPLY_RANK: Record<string, number> = {
  greenhouse: 5, lever: 5, ashby: 5, workable: 4, recruitee: 4, smartrecruiters: 4,
  breezy: 4, teamtailor: 4, personio: 4, workday: 2, linkedin: 1, indeed: 1, hiringcafe: 1,
};
function applyRank(s: ScoredJob): number {
  return APPLY_RANK[(s.atsPlatform ?? "").toLowerCase()] ?? 3;
}
function postedMs(s: ScoredJob): number {
  return s.postedAt ? s.postedAt.getTime() : 0;
}

/**
 * Comparator: score desc, then freshest, then most automation-friendly apply path.
 * Tiebreaks only ever reorder among equal scores (spec Pt 13).
 */
function byScoreThenTiebreaks(a: ScoredJob, b: ScoredJob): number {
  if (b.score !== a.score) return b.score - a.score;
  if (postedMs(b) !== postedMs(a)) return postedMs(b) - postedMs(a);
  return applyRank(b) - applyRank(a);
}

/**
 * Pick the top `cap` shortlist-eligible jobs, excluding already-applied jobs,
 * limiting per-company representation for diversity, breaking score ties by
 * freshness then apply-path, and reserving a slice for the freshest jobs so the
 * slate isn't all stale-but-high-score roles. Result is ordered best-first.
 */
export function selectTopMatches(
  scored: ScoredJob[],
  cap: number,
  opts: SelectOptions = {},
): ScoredJob[] {
  if (cap <= 0) return [];
  const applied = opts.alreadyAppliedJobIds ?? new Set<string>();

  const ranked = scored
    .filter((s) => s.decision === "SHORTLIST" && !applied.has(s.jobId))
    .slice()
    .sort(byScoreThenTiebreaks);

  // Cross-source dedup: collapse the same logical job (same canonicalKey) seen on
  // multiple sources to one — highest score wins (list is score-sorted). Applies to
  // the FREE path too (the balanced/paid path also dedups earlier; this is
  // idempotent there). Postings without a canonicalKey fall back to jobId (no merge).
  const seenCanon = new Set<string>();
  const eligible = ranked.filter((s) => {
    const k = (s.canonicalKey && s.canonicalKey.trim()) || `id:${s.jobId}`;
    if (seenCanon.has(k)) return false;
    seenCanon.add(k);
    return true;
  });

  const maxPerCompany = opts.maxPerCompany ?? 0;
  let picked: ScoredJob[];
  if (maxPerCompany <= 0) {
    picked = eligible.slice(0, cap);
  } else {
    // Pass 1: diverse — respect the per-company cap. Pass 2: fill remaining, ignore cap.
    const perCompany = new Map<string, number>();
    const chosen: ScoredJob[] = [];
    const leftovers: ScoredJob[] = [];
    for (const job of eligible) {
      if (chosen.length >= cap) break;
      const key = companyKey(job);
      const used = perCompany.get(key) ?? 0;
      if (used < maxPerCompany) {
        chosen.push(job);
        perCompany.set(key, used + 1);
      } else {
        leftovers.push(job);
      }
    }
    for (const job of leftovers) {
      if (chosen.length >= cap) break;
      chosen.push(job);
    }
    picked = chosen;
  }

  picked = applyFreshReserve(picked, eligible, cap, opts);
  return picked.sort(byScoreThenTiebreaks).slice(0, cap);
}

/**
 * Ensure at least `round(cap * freshReserveRatio)` of the slate is fresh (posted
 * within `freshHours`), swapping the lowest-scored stale picks for the
 * highest-scored fresh eligibles that weren't selected. No-op when disabled or
 * when not enough fresh jobs exist.
 */
function applyFreshReserve(
  picked: ScoredJob[],
  eligible: ScoredJob[],
  cap: number,
  opts: SelectOptions,
): ScoredJob[] {
  const ratio = opts.freshReserveRatio ?? 0.15;
  if (ratio <= 0) return picked;
  const freshHours = opts.freshHours ?? 24;
  const nowMs = opts.nowMs ?? Date.now();
  const cutoff = nowMs - freshHours * 3_600_000;
  const isFresh = (s: ScoredJob) => postedMs(s) > 0 && postedMs(s) >= cutoff;

  const target = Math.round(Math.min(cap, picked.length) * ratio);
  if (target <= 0) return picked;

  const pickedIds = new Set(picked.map((s) => s.jobId));
  const freshInPicked = picked.filter(isFresh).length;
  if (freshInPicked >= target) return picked;

  const freshLeftovers = eligible
    .filter((s) => isFresh(s) && !pickedIds.has(s.jobId))
    .sort(byScoreThenTiebreaks);
  if (!freshLeftovers.length) return picked;

  // Swap out lowest-scored STALE picks for the best fresh leftovers.
  const result = picked.slice();
  let need = target - freshInPicked;
  for (const fresh of freshLeftovers) {
    if (need <= 0) break;
    // find the worst stale pick to evict
    let worstIdx = -1;
    for (let i = 0; i < result.length; i++) {
      if (isFresh(result[i]!)) continue;
      if (worstIdx === -1 || byScoreThenTiebreaks(result[i]!, result[worstIdx]!) > 0) worstIdx = i;
    }
    if (worstIdx === -1) break; // nothing stale to evict
    result[worstIdx] = fresh;
    need--;
  }
  return result;
}
