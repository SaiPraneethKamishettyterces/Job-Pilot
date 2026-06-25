// Multi-factor 0-100 scoring (spec Pt 10-11). Produces an explicit per-factor
// breakdown + a weighted final score + structured reason codes, so a match is
// explainable and tunable rather than an opaque single number. Deterministic and
// pure (DB-free, unit-testable); the reranker may blend an LLM holistic score into
// the soft factors (skill/experience/domain) when an AI provider is configured.
import { matchesRole, roleSpecs, titleOverlap, titleWords } from "./title-match.js";
import {
  NEGATIVE_CODES,
  POSITIVE_CODES,
  statusTierForScore,
  type ReasonCode,
  type StatusTier,
} from "./reason-codes.js";

// Spec weights (sum = 100). ATS keyword match is deliberately NOT the top factor.
export type FactorWeights = {
  role: number;
  experience: number;
  skill: number;
  ats: number;
  location: number;
  workAuth: number;
  domain: number;
  compensation: number;
  recency: number;
  feasibility: number;
};

export const DEFAULT_WEIGHTS: FactorWeights = {
  role: 18,
  experience: 20,
  skill: 18,
  ats: 12,
  location: 10,
  workAuth: 8,
  domain: 5,
  compensation: 4,
  recency: 3,
  feasibility: 2,
};

export type FactorJob = {
  title: string;
  location: string | null;
  isRemote: boolean | null;
  remoteType: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  experienceMin: number | null;
  experienceMax: number | null;
  workAuthorization: string | null;
  description?: string | null;
  skills: string[];
  tools: string[];
  atsPlatform: string | null;
  applyUrl: string | null;
  jobUrl: string | null;
  postedAt: Date | null;
  firstSeenAt?: Date | null;
};

export type FactorProfile = {
  skills: string[];
  tools: string[];
  yearsExperience: number | null;
  targetRoles: string[];
  acceptableAdjacentRoles: string[];
  domains: string[];
  industries: string[];
  remotePreference: string;
  places: string[];
  minSalary: number | null;
  workAuthorization: string | null;
};

export type FactorScores = {
  role: number;
  experience: number;
  skill: number;
  ats: number;
  location: number;
  workAuth: number;
  domain: number;
  compensation: number;
  recency: number;
  feasibility: number;
};

export type FactorResult = {
  factors: FactorScores;
  finalScore: number;
  statusTier: StatusTier;
  reasonCodes: ReasonCode[];
};

const DIRECT_ATS = new Set(["greenhouse", "lever", "ashby", "workable", "recruitee", "smartrecruiters"]);
const GATED_ATS = new Set(["workday", "icims", "taleo", "successfactors"]);

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function fraction(have: Set<string>, want: string[]): number {
  if (!want.length) return 0;
  const hit = want.filter((w) => have.has(w.toLowerCase())).length;
  return hit / want.length;
}

function scoreRole(job: FactorJob, p: FactorProfile): number {
  const targetSpecs = roleSpecs(p.targetRoles);
  const adjacentSpecs = roleSpecs(p.acceptableAdjacentRoles);
  if (!targetSpecs.length && !adjacentSpecs.length) return 60; // no target → neutral
  if (matchesRole(job.title, targetSpecs)) return clamp(90 + 10 * titleOverlap(job.title, targetSpecs));
  if (matchesRole(job.title, adjacentSpecs)) return 78; // strong adjacent
  const overlap = Math.max(titleOverlap(job.title, targetSpecs), titleOverlap(job.title, adjacentSpecs));
  return clamp(30 + overlap * 45); // weak adjacent / partial
}

function scoreExperience(job: FactorJob, p: FactorProfile): number {
  const reqMin = job.experienceMin;
  const years = p.yearsExperience;
  if (reqMin == null || reqMin <= 0 || years == null) return 70; // unknown → pass-with-caution
  if (years >= reqMin) {
    // In range fits best; far over still fine but slightly less ideal.
    if (job.experienceMax != null && years > job.experienceMax + 4) return 78; // overqualified
    return clamp(90 + Math.min(10, (years - reqMin) * 2));
  }
  const ratio = years / reqMin;
  if (ratio >= 0.7) return clamp(70 + (ratio - 0.7) * 50); // slightly below
  return clamp(40 + (ratio - 0.5) * 145); // meaningfully below (gate handles <0.5)
}

function scoreSkill(job: FactorJob, p: FactorProfile): number {
  const have = new Set([...p.skills, ...p.tools].map((s) => s.toLowerCase()));
  const want = [...job.skills, ...job.tools];
  if (!want.length) return 60;
  return clamp(fraction(have, want) * 100);
}

function scoreAts(job: FactorJob, p: FactorProfile): number {
  // Cheap keyword proxy: how many job skill/tool tokens appear in the candidate's
  // skills + tools + target-role text. Capped so it never dominates the decision.
  const text = new Set(
    [...p.skills, ...p.tools, ...p.targetRoles].flatMap((s) => [...titleWords(s)]),
  );
  const want = [...job.skills, ...job.tools].flatMap((s) => [...titleWords(s)]);
  if (!want.length) return 55;
  const hit = want.filter((w) => text.has(w)).length / want.length;
  return clamp(hit * 100);
}

function scoreLocation(job: FactorJob, p: FactorProfile): number {
  const isRemoteJob = job.remoteType === "remote" || job.isRemote === true;
  if (p.remotePreference === "remote") return isRemoteJob ? 100 : 20;
  if (isRemoteJob) return 95;
  const loc = (job.location ?? "").toLowerCase();
  if (p.places.length && loc) return p.places.some((pl) => loc.includes(pl)) ? 90 : 45;
  return 70; // unknown / no strict place preference
}

function scoreWorkAuth(job: FactorJob): number {
  const text = `${job.workAuthorization ?? ""} ${job.description ?? ""}`.toLowerCase();
  if (!text.trim()) return 75; // unknown
  if (/sponsor|visa|h1b|opt/.test(text)) return 100; // explicitly sponsorship-friendly
  return 70;
}

function scoreDomain(job: FactorJob, p: FactorProfile): number {
  const terms = [...p.domains, ...p.industries].map((s) => s.toLowerCase()).filter(Boolean);
  if (!terms.length) return 60; // not configured → neutral
  const hay = `${job.description ?? ""} ${job.title}`.toLowerCase();
  return terms.some((t) => hay.includes(t)) ? 90 : 50;
}

function scoreCompensation(job: FactorJob, p: FactorProfile): number {
  if (job.salaryMin == null && job.salaryMax == null) return 70; // unknown but role-level
  if (p.minSalary == null) return 85;
  const top = job.salaryMax ?? job.salaryMin ?? 0;
  return top >= p.minSalary ? 95 : 35;
}

function scoreRecency(job: FactorJob, nowMs: number): number {
  const ref = job.postedAt ?? job.firstSeenAt ?? null;
  if (!ref) return 60; // unknown freshness
  const hours = (nowMs - ref.getTime()) / 3_600_000;
  if (hours <= 24) return 100;
  if (hours <= 72) return 85;
  if (hours <= 168) return 70;
  if (hours <= 336) return 50;
  return 20;
}

function scoreFeasibility(job: FactorJob): number {
  const ats = (job.atsPlatform ?? "").toLowerCase();
  if (DIRECT_ATS.has(ats)) return 95;
  if (GATED_ATS.has(ats)) return 50;
  if (ats === "linkedin") return 40;
  if (ats === "indeed" || ats === "hiringcafe") return 55;
  return job.applyUrl ? 80 : 65; // direct apply URL > listing-only
}

/** Score all 10 factors and combine into a weighted 0-100 final + status tier. */
export function scoreFactors(
  job: FactorJob,
  profile: FactorProfile,
  opts: { weights?: FactorWeights; nowMs?: number; llmHolistic?: number | null } = {},
): FactorResult {
  const w = opts.weights ?? DEFAULT_WEIGHTS;
  const nowMs = opts.nowMs ?? Date.now();

  const factors: FactorScores = {
    role: scoreRole(job, profile),
    experience: scoreExperience(job, profile),
    skill: scoreSkill(job, profile),
    ats: scoreAts(job, profile),
    location: scoreLocation(job, profile),
    workAuth: scoreWorkAuth(job),
    domain: scoreDomain(job, profile),
    compensation: scoreCompensation(job, profile),
    recency: scoreRecency(job, nowMs),
    feasibility: scoreFeasibility(job),
  };

  // Blend an LLM holistic judgement (0-100) into the soft, judgement-heavy factors
  // so the deterministic structure stays but real fit nuance is captured.
  if (opts.llmHolistic != null) {
    const llm = clamp(opts.llmHolistic);
    factors.skill = clamp(0.5 * factors.skill + 0.5 * llm);
    factors.experience = clamp(0.6 * factors.experience + 0.4 * llm);
    factors.domain = clamp(0.6 * factors.domain + 0.4 * llm);
  }

  const totalW =
    w.role + w.experience + w.skill + w.ats + w.location + w.workAuth + w.domain + w.compensation + w.recency + w.feasibility;
  const weighted =
    factors.role * w.role +
    factors.experience * w.experience +
    factors.skill * w.skill +
    factors.ats * w.ats +
    factors.location * w.location +
    factors.workAuth * w.workAuth +
    factors.domain * w.domain +
    factors.compensation * w.compensation +
    factors.recency * w.recency +
    factors.feasibility * w.feasibility;
  const finalScore = clamp(weighted / (totalW || 1));

  return {
    factors,
    finalScore,
    statusTier: statusTierForScore(finalScore),
    reasonCodes: deriveReasonCodes(factors),
  };
}

function deriveReasonCodes(f: FactorScores): ReasonCode[] {
  const codes: ReasonCode[] = [];
  if (f.role >= 80) codes.push(POSITIVE_CODES.ROLE_MATCH_STRONG);
  if (f.experience >= 80) codes.push(POSITIVE_CODES.EXPERIENCE_MATCH);
  if (f.skill >= 70) codes.push(POSITIVE_CODES.SKILLS_MATCH_STRONG);
  if (f.ats >= 75) codes.push(POSITIVE_CODES.ATS_MATCH_HIGH);
  if (f.location >= 90) codes.push(POSITIVE_CODES.LOCATION_MATCH);
  if (f.workAuth >= 100) codes.push(POSITIVE_CODES.WORK_AUTH_COMPATIBLE);
  if (f.domain >= 80) codes.push(POSITIVE_CODES.DOMAIN_MATCH);
  if (f.recency >= 100) codes.push(POSITIVE_CODES.FRESH_JOB);
  if (f.feasibility >= 90) codes.push(POSITIVE_CODES.DIRECT_ATS_APPLY);
  if (f.skill < 40) codes.push(NEGATIVE_CODES.LOW_SKILL_MATCH);
  if (f.ats < 40) codes.push(NEGATIVE_CODES.LOW_ATS_MATCH);
  if (f.recency <= 20) codes.push(NEGATIVE_CODES.OLD_JOB);
  return codes;
}
