// Stage A — candidate generation. Cheap, no LLM: retrieve the most relevant
// postings from the global pool. Uses vector ANN when an AI provider is configured
// (semantic match); otherwise falls back to SQL keyword/recency retrieval so jobs
// still flow with zero AI key. Returns ~200 candidates for the reranker (stage B).
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { compatEmbed, hasCompat } from "../ai/ai-service.js";
import {
  searchCandidates,
  searchCandidatesNoVector,
  type CandidateFilters,
  type PostingCandidate,
} from "../../repositories/job-posting-repository.js";
import type { ProfileSnapshot } from "./match-scorer.js";

export const CANDIDATE_LIMIT = 200;

/** The text we embed to represent "what this user is looking for". */
function queryText(snapshot: ProfileSnapshot): string {
  return [
    snapshot.targetRoles.length ? `Target roles: ${snapshot.targetRoles.join(", ")}` : "",
    snapshot.currentTitle ? `Current title: ${snapshot.currentTitle}` : "",
    snapshot.skills.length ? `Skills: ${snapshot.skills.slice(0, 40).join(", ")}` : "",
    snapshot.summary ?? "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Retrieve candidate postings for a user from the global pool. Prefers semantic
 * (vector) retrieval; degrades to keyword/recency when no AI provider is configured
 * or the pool isn't embedded yet — so users always get jobs.
 */
export async function generateCandidates(
  userId: string,
  snapshot: ProfileSnapshot,
  limit = CANDIDATE_LIMIT,
  // Extra hard filters (e.g. source bucket for the 50/50 split). Merged into the
  // base filters for BOTH the vector and no-vector retrieval paths.
  extra: Partial<CandidateFilters> = {},
): Promise<PostingCandidate[]> {
  // Preferred locations (prefs) + sponsorship requirement (profile) aren't on the
  // snapshot — load the few extra fields we need for the hard filters.
  const [prefs, profile, appliedJobs] = await Promise.all([
    prisma.userPreference.findUnique({ where: { userId }, select: { locationsJson: true } }),
    prisma.userProfile.findUnique({ where: { userId }, select: { requiresSponsorship: true } }),
    prisma.job.findMany({ where: { userId, postingId: { not: null } }, select: { postingId: true } }),
  ]);

  const locations = ((prefs?.locationsJson as string[] | undefined) ?? []).map((s) => s.toLowerCase().trim()).filter(Boolean);
  const requireRemote = snapshot.remotePreference === "remote" || locations.includes("remote");
  const places = locations.filter((l) => l !== "remote");
  const excludePostingIds = appliedJobs.map((j) => j.postingId).filter((v): v is string => Boolean(v));

  const baseFilters: CandidateFilters = {
    blockedCompanies: snapshot.blockedCompanies,
    requireRemote,
    places,
    minSalary: snapshot.minSalary,
    requiresSponsorship: Boolean(profile?.requiresSponsorship),
    excludePostingIds,
    // Durable, cross-source, survives-purge per-user already-shown guard (Gap 3).
    excludeSeenForUserId: userId,
    ...extra,
  };

  // Run a retrieval at the "daily-new" window; if too few, widen once to the
  // fallback window so a slow day still fills the shortlist.
  const withFreshness = async (
    retrieve: (fHours: number) => Promise<PostingCandidate[]>,
  ): Promise<{ rows: PostingCandidate[]; window: number }> => {
    let rows = await retrieve(config.matching.freshnessHours);
    let window = config.matching.freshnessHours;
    if (rows.length < config.matching.minFreshCandidates &&
        config.matching.freshnessFallbackHours > config.matching.freshnessHours) {
      window = config.matching.freshnessFallbackHours;
      rows = await retrieve(window);
    }
    return { rows, window };
  };

  // 1) Semantic path — only when AI is configured and we can build a query vector.
  if (hasCompat()) {
    const text = queryText(snapshot);
    if (text.trim()) {
      const [queryVector] = await compatEmbed([text]);
      if (queryVector?.length) {
        const { rows, window } = await withFreshness((fHours) =>
          searchCandidates(queryVector, { ...baseFilters, freshnessHours: fHours }, limit),
        );
        if (rows.length) {
          logger.info({ userId, candidates: rows.length, mode: "vector", freshnessHours: window }, "generateCandidates");
          return rows;
        }
      }
    }
  }

  // 2) No-AI / un-embedded-pool fallback — keyword (target roles) + recency.
  const { rows, window } = await withFreshness((fHours) =>
    searchCandidatesNoVector({ ...baseFilters, freshnessHours: fHours }, snapshot.targetRoles, limit),
  );
  logger.info({ userId, candidates: rows.length, mode: "keyword", freshnessHours: window }, "generateCandidates (no-AI fallback)");
  return rows;
}
