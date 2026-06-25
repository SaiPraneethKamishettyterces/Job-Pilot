// 50/50 balanced shortlist for PAID plans (owner directive): each daily slate is
// ~half Apify-sourced + ~half free-sourced, with NO cross-source duplication, and
// backfill from the other side when one underdelivers. Free plans never see Apify
// postings (no spend on non-paying users). The cross-source dedup uses the
// source-agnostic canonicalKey so the same role from LinkedIn and the company ATS
// collapses to one. The pure mergeBalanced() is unit-tested without a DB.
import { generateCandidates } from "./candidate-generator.js";
import { rerankCandidates } from "./rerank.js";
import type { ProfileSnapshot } from "./match-scorer.js";
import type { ScoredJob } from "./select-matches.js";

// Apify-track sources (paid). Everything else in the pool is "free".
export const APIFY_SOURCE_NAMES = ["linkedin", "indeed", "hiringcafe"];

function dedupKey(s: ScoredJob): string {
  return (s.canonicalKey && s.canonicalKey.trim()) || `id:${s.jobId}`;
}

export type MergeOpts = { ratio?: number };

/**
 * Merge two scored buckets into a ~`ratio`/`(1-ratio)` Apify/free slate of size
 * `cap`, deduped by canonicalKey across buckets, backfilling from the other side
 * when one is short. Apify is filled first (it's the scarcer, paid side) so its
 * canonicalKeys win ties; the free side then skips anything already claimed.
 */
export function mergeBalanced(
  apify: ScoredJob[],
  free: ScoredJob[],
  cap: number,
  opts: MergeOpts = {},
): ScoredJob[] {
  if (cap <= 0) return [];
  const ratio = opts.ratio ?? 0.5;
  const apifyTarget = Math.round(cap * ratio);

  const byScore = (a: ScoredJob, b: ScoredJob) => b.score - a.score;
  const a = apify.filter((s) => s.decision === "SHORTLIST").slice().sort(byScore);
  const f = free.filter((s) => s.decision === "SHORTLIST").slice().sort(byScore);

  const claimed = new Set<string>();
  const picked: ScoredJob[] = [];
  const take = (s: ScoredJob): boolean => {
    const k = dedupKey(s);
    if (claimed.has(k)) return false;
    claimed.add(k);
    picked.push(s);
    return true;
  };

  // Fill the Apify half first, then the free half.
  let aCount = 0;
  for (const s of a) {
    if (aCount >= apifyTarget) break;
    if (take(s)) aCount++;
  }
  let fCount = 0;
  const freeTarget = cap - aCount;
  for (const s of f) {
    if (fCount >= freeTarget) break;
    if (take(s)) fCount++;
  }

  // Backfill any shortfall from whichever side has leftovers (deduped).
  if (picked.length < cap) {
    for (const s of [...f, ...a]) {
      if (picked.length >= cap) break;
      take(s);
    }
  }

  return picked.sort(byScore).slice(0, cap);
}

/**
 * Paid-plan path: retrieve + rerank the Apify and free buckets separately (each
 * gets its own rerank/LLM budget), then merge 50/50. Returns the final ordered
 * shortlist (already capped) — the pipeline uses it directly.
 */
export async function generateBalancedScored(
  userId: string,
  snapshot: ProfileSnapshot,
  runId: string,
  cap: number,
  opts: MergeOpts = {},
): Promise<ScoredJob[]> {
  const [apifyCand, freeCand] = await Promise.all([
    generateCandidates(userId, snapshot, undefined, { sourceNamesIn: APIFY_SOURCE_NAMES }),
    generateCandidates(userId, snapshot, undefined, { sourceNamesNotIn: APIFY_SOURCE_NAMES }),
  ]);
  const [apifyScored, freeScored] = await Promise.all([
    rerankCandidates(apifyCand, snapshot, userId, runId),
    rerankCandidates(freeCand, snapshot, userId, runId),
  ]);
  return mergeBalanced(apifyScored, freeScored, cap, opts);
}
