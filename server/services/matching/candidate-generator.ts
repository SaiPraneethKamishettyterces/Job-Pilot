// Stage A — candidate generation. Cheap, no LLM: build a query vector from the
// user's profile and retrieve the nearest postings from the global pool via ANN,
// narrowed by hard SQL filters (location, work-auth, blocked, salary, freshness,
// already-seen). Returns ~200 candidates for the reranker (stage B) to refine.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { compatEmbed, hasCompat } from "../ai/ai-service.js";
import {
  searchCandidates,
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
 * Retrieve candidate postings for a user from the global pool. Returns [] when no
 * embedding provider is configured (the pool can't be searched without a query
 * vector), so callers degrade gracefully rather than throwing.
 */
export async function generateCandidates(
  userId: string,
  snapshot: ProfileSnapshot,
  limit = CANDIDATE_LIMIT,
): Promise<PostingCandidate[]> {
  if (!hasCompat()) {
    logger.warn({ userId }, "generateCandidates: AI provider not configured — no vector retrieval");
    return [];
  }

  const text = queryText(snapshot);
  if (!text.trim()) return [];
  const [queryVector] = await compatEmbed([text]);
  if (!queryVector?.length) return [];

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

  const filters: CandidateFilters = {
    blockedCompanies: snapshot.blockedCompanies,
    requireRemote,
    places,
    minSalary: snapshot.minSalary,
    requiresSponsorship: Boolean(profile?.requiresSponsorship),
    freshnessHours: config.matching.freshnessHours,
    excludePostingIds,
  };

  // "Daily-new": pull postings new within the last 24h. If a slow day yields too
  // few, widen ONCE to the fallback window so the shortlist still fills.
  let candidates = await searchCandidates(queryVector, filters, limit);
  let window = config.matching.freshnessHours;
  if (candidates.length < config.matching.minFreshCandidates &&
      config.matching.freshnessFallbackHours > config.matching.freshnessHours) {
    window = config.matching.freshnessFallbackHours;
    candidates = await searchCandidates(queryVector, { ...filters, freshnessHours: window }, limit);
  }
  logger.info(
    { userId, candidates: candidates.length, freshnessHours: window,
      widened: window !== config.matching.freshnessHours },
    "generateCandidates: stage A retrieval",
  );
  return candidates;
}
