// Stage B — rerank. Takes the ~200 stage-A candidates, applies a cheap
// deterministic feature score (vector similarity + title/role overlap + skill
// overlap), keeps the top slice, and LLM-reranks ONLY those (Gemini Flash) to pick
// the best matches. For each reranked candidate it materializes a per-user Job row
// (linked to the global posting) and a JobMatch, then emits ScoredJob[] for
// selectTopMatches — the exact shape the existing pipeline already consumes.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { hasProvider } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";
import { scoreJobMatch, type ProfileSnapshot } from "./match-scorer.js";
import { roleSpecs, titleOverlap } from "./title-match.js";
import { evaluateGates, type GateJob, type GateProfile } from "./hard-gates.js";
import { scoreFactors, type FactorJob, type FactorProfile } from "./factor-scoring.js";
import type { ScoredJob } from "./select-matches.js";
import type { PostingCandidate } from "../../repositories/job-posting-repository.js";
import type { ParsedJob } from "../job-discovery/job-parser.js";

type MatchVerdict = { score: number; decision: "SHORTLIST" | "REVIEW" | "SKIP"; reasons: string[]; risks: string[] };

// How many of the cheaply-ranked candidates get the (more expensive) LLM rerank.
export const RERANK_LIMIT = 40;

function asStringArray(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

function gateProfile(s: ProfileSnapshot): GateProfile {
  return {
    yearsExperience: s.yearsExperience,
    targetRoles: s.targetRoles,
    acceptableAdjacentRoles: s.acceptableAdjacentRoles,
    excludedRoles: s.excludedRoles,
    seniorityBand: s.seniorityBand,
    employmentTypePreference: s.employmentTypePreference,
    remotePreference: s.remotePreference,
    places: s.places,
    minSalary: s.minSalary,
    requiresSponsorship: s.requiresSponsorship,
  };
}

function factorProfile(s: ProfileSnapshot): FactorProfile {
  return {
    skills: s.skills,
    tools: s.tools,
    yearsExperience: s.yearsExperience,
    targetRoles: s.targetRoles,
    acceptableAdjacentRoles: s.acceptableAdjacentRoles,
    domains: s.domains,
    industries: s.industries,
    remotePreference: s.remotePreference,
    places: s.places,
    minSalary: s.minSalary,
    workAuthorization: s.workAuthorization,
  };
}

function toGateJob(p: PostingCandidate): GateJob {
  return {
    title: p.title,
    location: p.location,
    isRemote: p.isRemote,
    remoteType: p.remoteType,
    employmentType: p.employmentType,
    seniority: p.seniority,
    salaryMin: p.salaryMin,
    salaryMax: p.salaryMax,
    experienceMin: p.experienceMin,
    experienceMax: p.experienceMax,
    workAuthorization: p.workAuthorization,
    description: p.descriptionClean ?? p.description,
  };
}

function toFactorJob(p: PostingCandidate): FactorJob {
  return {
    title: p.title,
    location: p.location,
    isRemote: p.isRemote,
    remoteType: p.remoteType,
    salaryMin: p.salaryMin,
    salaryMax: p.salaryMax,
    experienceMin: p.experienceMin,
    experienceMax: p.experienceMax,
    workAuthorization: p.workAuthorization,
    description: p.descriptionClean ?? p.description,
    skills: asStringArray(p.skillsJson),
    tools: asStringArray(p.toolsJson),
    atsPlatform: p.atsPlatform,
    applyUrl: p.applyUrl,
    jobUrl: p.jobUrl,
    postedAt: p.postedAt,
  };
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

/** Deterministic score components in 0..1: vector similarity, title/role overlap, skill overlap. */
function scoreComponents(p: PostingCandidate, specs: string[][], userSkills: Set<string>) {
  const jobSkills = asStringArray(p.skillsJson).map((s) => s.toLowerCase());
  const skill = jobSkills.length ? jobSkills.filter((s) => userSkills.has(s)).length / jobSkills.length : 0;
  const title = titleOverlap(p.title, specs);
  // Blended score used for ranking (vector dominates when present).
  const combined = 0.6 * p.vectorScore + 0.25 * title + 0.15 * skill;
  return { combined, title, skill };
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
  const userSkills = new Set([...snapshot.skills, ...snapshot.tools].map((s) => s.toLowerCase()));
  const aiAvailable = hasProvider(TASK_MODEL.matchScore.provider);
  const gp = gateProfile(snapshot);
  const fp = factorProfile(snapshot);
  const threshold = snapshot.matchThreshold;

  // Hard gates FIRST (spec Pt 9): reject impossible pairs before any scoring, so a
  // high keyword/ATS match can't override an experience/seniority/auth disqualifier
  // — and so the LLM rerank only ever runs on viable candidates (cost funnel).
  const gateFailures: Record<string, number> = {};
  const survivors: PostingCandidate[] = [];
  for (const p of candidates) {
    const g = evaluateGates(toGateJob(p), gp);
    if (g.passed) survivors.push(p);
    else for (const code of g.failedGates) gateFailures[code] = (gateFailures[code] ?? 0) + 1;
  }
  const gatedOut = candidates.length - survivors.length;
  if (gatedOut > 0) {
    prisma.applicationRun
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .update({ where: { id: runId }, data: { jobsGated: gatedOut, gateFailuresJson: gateFailures as any } })
      .catch(() => {}); // manual /jobs route may pass a non-run id — non-fatal
  }

  // Cheap pass over survivors → keep the top slice for (optional) LLM rerank.
  const ranked = survivors
    .map((p) => ({ p, c: scoreComponents(p, specs, userSkills) }))
    .sort((a, b) => b.c.combined - a.c.combined)
    .slice(0, RERANK_LIMIT);

  const nowMs = Date.now();
  const scored: ScoredJob[] = [];
  for (const { p, c } of ranked) {
    const feature = c.combined;
    // LLM holistic judgement (when configured) blends into the soft factors; the
    // deterministic 10-factor model produces the explainable per-factor breakdown.
    const llm: MatchVerdict | null = aiAvailable ? await scoreJobMatch(postingToParsedJob(p), snapshot) : null;
    const fr = scoreFactors(toFactorJob(p), fp, { nowMs, llmHolistic: llm?.score ?? null });

    const finalScore = fr.finalScore;
    // Decision: an LLM hard-SKIP always wins; otherwise threshold tiers on the
    // weighted factor score (keeps selectTopMatches' SHORTLIST contract).
    const decision: MatchVerdict["decision"] =
      llm?.decision === "SKIP"
        ? "SKIP"
        : finalScore >= threshold
          ? "SHORTLIST"
          : finalScore >= threshold - 15
            ? "REVIEW"
            : "SKIP";
    const reasons = llm?.reasons?.length ? llm.reasons : ["Matched by factor scoring (AI scoring not configured)"];
    const risks = llm?.risks ?? [];

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

    const matchData = {
      score: finalScore,
      decision,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reasonsJson: reasons as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      risksJson: risks as any,
      stage: "reranked",
      vectorScore: p.vectorScore,
      featureScore: feature,
      statusTier: fr.statusTier,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      reasonCodesJson: fr.reasonCodes as any,
      gateStatus: "passed",
      roleFitScore: fr.factors.role,
      experienceFitScore: fr.factors.experience,
      skillScore: fr.factors.skill,
      atsScore: fr.factors.ats,
      locationScore: fr.factors.location,
      workAuthScore: fr.factors.workAuth,
      domainScore: fr.factors.domain,
      compensationScore: fr.factors.compensation,
      recencyScore: fr.factors.recency,
      feasibilityScore: fr.factors.feasibility,
    };
    await prisma.jobMatch.upsert({
      where: { jobId_userId: { jobId: job.id, userId } },
      create: { jobId: job.id, userId, ...matchData },
      update: matchData,
    });

    // Durable per-user "already shown" ledger (survives the weekly purge + is
    // source-agnostic) so this user is never re-shown the same logical job later.
    if (p.canonicalKey) {
      await prisma.userJobSeen
        .upsert({
          where: { userId_canonicalKey: { userId, canonicalKey: p.canonicalKey } },
          create: { userId, canonicalKey: p.canonicalKey },
          update: { lastShownAt: new Date() },
        })
        .catch(() => {}); // non-fatal — never block scoring on the ledger write
    }

    scored.push({
      jobId: job.id, score: finalScore, decision,
      company: p.company, title: p.title,
      jobUrl: p.applyUrl ?? p.jobUrl ?? null, atsPlatform: p.atsPlatform ?? null,
      postedAt: p.postedAt ?? null, canonicalKey: p.canonicalKey ?? null,
    });
  }

  logger.info(
    { userId, reranked: scored.length, candidates: candidates.length, gatedOut },
    "rerankCandidates: stage B",
  );
  return scored;
}
