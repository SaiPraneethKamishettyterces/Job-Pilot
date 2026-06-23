// Stage B — rerank. Takes the ~200 stage-A candidates, applies a cheap
// deterministic feature score (vector similarity + title/role overlap + skill
// overlap), keeps the top slice, and LLM-reranks ONLY those (Gemini Flash) to pick
// the best matches. For each reranked candidate it materializes a per-user Job row
// (linked to the global posting) and a JobMatch, then emits ScoredJob[] for
// selectTopMatches — the exact shape the existing pipeline already consumes.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { scoreJobMatch, type ProfileSnapshot } from "./match-scorer.js";
import { roleSpecs, titleOverlap } from "./title-match.js";
import type { ScoredJob } from "./select-matches.js";
import type { PostingCandidate } from "../../repositories/job-posting-repository.js";
import type { ParsedJob } from "../job-discovery/job-parser.js";

// How many of the cheaply-ranked candidates get the (more expensive) LLM rerank.
export const RERANK_LIMIT = 40;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

function postingToParsedJob(p: PostingCandidate): ParsedJob {
  return {
    title: p.title,
    company: p.company,
    location: p.location ?? null,
    isRemote: p.isRemote ?? false,
    salaryMin: p.salaryMin ?? null,
    salaryMax: p.salaryMax ?? null,
    salaryCurrency: p.salaryCurrency ?? null,
    description: p.descriptionClean ?? p.description ?? "",
    requirements: asStringArray(p.requirementsJson),
    skills: asStringArray(p.skillsJson),
    experienceMin: p.experienceMin ?? null,
    experienceMax: p.experienceMax ?? null,
    atsPlatform: p.atsPlatform ?? null,
    workAuthorization: p.workAuthorization ?? null,
    jobUrl: p.jobUrl ?? null,
  };
}

/** Deterministic 0..1 feature score: vector + title/role overlap + skill overlap. */
function featureScore(p: PostingCandidate, specs: string[][], userSkills: Set<string>): number {
  const jobSkills = asStringArray(p.skillsJson).map((s) => s.toLowerCase());
  const skillOverlap = jobSkills.length
    ? jobSkills.filter((s) => userSkills.has(s)).length / jobSkills.length
    : 0;
  const titleScore = titleOverlap(p.title, specs);
  return 0.6 * p.vectorScore + 0.25 * titleScore + 0.15 * skillOverlap;
}

/**
 * Rerank candidates and materialize per-user Job + JobMatch rows. Returns the
 * scored jobs (best-first) for selectTopMatches.
 */
export async function rerankCandidates(
  candidates: PostingCandidate[],
  snapshot: ProfileSnapshot,
  userId: string,
  runId: string,
): Promise<ScoredJob[]> {
  if (!candidates.length) return [];

  const specs = roleSpecs(snapshot.targetRoles);
  const userSkills = new Set(snapshot.skills.map((s) => s.toLowerCase()));

  // Cheap pass over ALL candidates → keep the top slice for LLM rerank.
  const ranked = candidates
    .map((p) => ({ p, feature: featureScore(p, specs, userSkills) }))
    .sort((a, b) => b.feature - a.feature)
    .slice(0, RERANK_LIMIT);

  const scored: ScoredJob[] = [];
  for (const { p, feature } of ranked) {
    // LLM rerank (Gemini Flash via scoreJobMatch).
    const result = await scoreJobMatch(postingToParsedJob(p), snapshot);

    // Materialize the per-user Job handle (idempotent on (userId, postingId)).
    const job = await prisma.job.upsert({
      where: { userId_postingId: { userId, postingId: p.id } },
      create: {
        userId,
        runId,
        postingId: p.id,
        sourceName: p.atsPlatform,
        atsPlatform: p.atsPlatform,
        title: p.title,
        company: p.company,
        location: p.location,
        isRemote: p.isRemote,
        remoteType: p.remoteType,
        employmentType: p.employmentType,
        seniority: p.seniority,
        salaryMin: p.salaryMin,
        salaryMax: p.salaryMax,
        salaryCurrency: p.salaryCurrency,
        description: p.description,
        descriptionClean: p.descriptionClean,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        requirementsJson: p.requirementsJson as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        skillsJson: p.skillsJson as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toolsJson: p.toolsJson as any,
        experienceMin: p.experienceMin,
        experienceMax: p.experienceMax,
        workAuthorization: p.workAuthorization,
        jobUrl: p.jobUrl,
        applyUrl: p.applyUrl,
        postedAt: p.postedAt,
        ingestedAt: new Date(),
      },
      update: { runId },
    });

    await prisma.jobMatch.upsert({
      where: { jobId_userId: { jobId: job.id, userId } },
      create: {
        jobId: job.id, userId, score: result.score, decision: result.decision,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reasonsJson: result.reasons as any, risksJson: result.risks as any,
        stage: "reranked", vectorScore: p.vectorScore, featureScore: feature,
      },
      update: {
        score: result.score, decision: result.decision,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reasonsJson: result.reasons as any, risksJson: result.risks as any,
        stage: "reranked", vectorScore: p.vectorScore, featureScore: feature,
      },
    });

    scored.push({
      jobId: job.id, score: result.score, decision: result.decision,
      company: p.company, title: p.title,
      jobUrl: p.applyUrl ?? p.jobUrl ?? null, atsPlatform: p.atsPlatform ?? null,
    });
  }

  logger.info({ userId, reranked: scored.length, candidates: candidates.length }, "rerankCandidates: stage B");
  return scored;
}
