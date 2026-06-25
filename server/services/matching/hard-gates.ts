// Hard-gate engine (spec Pt 9). Runs BEFORE scoring and REJECTS impossible
// candidate-job pairs, so a high ATS/keyword match can never override an
// experience, seniority, location, or work-authorization disqualifier. Pure +
// synchronous so it's unit-testable without a DB and cheap to run on every
// candidate (it also shrinks the set that reaches the LLM reranker — the funnel).
import { roleSpecs, titleOverlap, titleWords } from "./title-match.js";
import { NEGATIVE_CODES, type NegativeCode } from "./reason-codes.js";

export type GateJob = {
  title: string;
  location: string | null;
  isRemote: boolean | null;
  remoteType: string | null;
  employmentType: string | null;
  seniority: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  experienceMin: number | null;
  experienceMax: number | null;
  workAuthorization: string | null;
  description?: string | null;
};

export type GateProfile = {
  yearsExperience: number | null;
  targetRoles: string[];
  acceptableAdjacentRoles: string[];
  excludedRoles: string[];
  // entry | junior_associate | early_mid | mid_senior | senior | staff_lead | principal_executive
  seniorityBand: string | null;
  employmentTypePreference: string[]; // e.g. ["full_time"]; empty = no preference
  remotePreference: string; // remote | hybrid | onsite | any
  places: string[]; // accepted location substrings (lowercased); empty = anywhere
  minSalary: number | null;
  requiresSponsorship: boolean;
};

export type GateConfig = {
  // Role gate fires only when title shares fewer than this fraction of a target
  // role's distinctive tokens — kept low to reject clearly-different families
  // (Product Manager vs Data Engineer) while letting adjacents through to scoring.
  roleMinOverlap: number;
};

export const DEFAULT_GATE_CONFIG: GateConfig = { roleMinOverlap: 0.34 };

export type GateResult = { passed: boolean; failedGates: NegativeCode[] };

// Leadership / very-senior title markers (spec seniority gate). "Senior" is NOT
// here — a senior IC role is fine for a senior candidate; these are the levels
// that need the candidate's band to explicitly allow them.
const LEADERSHIP_RE =
  /\b(staff|principal|lead|architect|manager|director|head\s+of|head|vp|vice\s+president|chief|cto|cfo|ceo|founding)\b/i;

// Bands that may take leadership / staff+ titles.
const LEADERSHIP_BANDS = new Set(["staff_lead", "principal_executive"]);

const NO_SPONSORSHIP_RE =
  /\b(no\s+sponsorship|without\s+sponsorship|not\s+(?:able\s+to\s+)?(?:provide|offer)\s+(?:visa\s+)?sponsorship|us\s+citizens?\s+only|citizenship\s+required|must\s+be\s+a\s+us\s+citizen|green\s+card\s+(?:holders?\s+)?only)\b/i;
const CLEARANCE_RE = /\b(security\s+clearance|active\s+clearance|ts\/sci|secret\s+clearance|clearance\s+required)\b/i;

/** Map a coarse seniority value (from title/JD) to a rank for comparison. */
function jobSeniorityRank(job: GateJob): number {
  const s = (job.seniority ?? "").toLowerCase();
  if (/lead|principal|staff|director|manager|head|vp|chief/.test(s)) return 3;
  if (s === "senior") return 2;
  return LEADERSHIP_RE.test(job.title) ? 3 : 1;
}

/**
 * Evaluate all hard gates. Returns passed=false with the list of failed gate
 * codes (so the caller can record/explain why). Unknown data passes "with
 * caution" (never reject on missing info), per the spec.
 */
export function evaluateGates(
  job: GateJob,
  profile: GateProfile,
  cfg: GateConfig = DEFAULT_GATE_CONFIG,
): GateResult {
  const failed: NegativeCode[] = [];
  const words = titleWords(job.title);

  // 1) Role-family gate. Explicit excludes always reject; otherwise reject only
  //    when the title shares essentially none of any target/adjacent role's
  //    distinctive tokens (keeps valid adjacents; scoring penalizes weak ones).
  const excludeSpecs = roleSpecs(profile.excludedRoles);
  if (excludeSpecs.some((spec) => spec.every((tok) => words.has(tok)))) {
    failed.push(NEGATIVE_CODES.ROLE_MISMATCH);
  } else {
    const targetSpecs = roleSpecs([...profile.targetRoles, ...profile.acceptableAdjacentRoles]);
    if (targetSpecs.length && titleOverlap(job.title, targetSpecs) < cfg.roleMinOverlap) {
      failed.push(NEGATIVE_CODES.ROLE_MISMATCH);
    }
  }

  // 2) Experience gate (the spec's most important rule). Only fires when the job
  //    states a minimum AND the candidate's years are known.
  const reqMin = job.experienceMin;
  const years = profile.yearsExperience;
  if (reqMin != null && reqMin > 0 && years != null) {
    if (years < 0.5 * reqMin) failed.push(NEGATIVE_CODES.EXPERIENCE_TOO_LOW);
    else if (reqMin >= 12 && years < 8) failed.push(NEGATIVE_CODES.EXPERIENCE_TOO_LOW);
    else if (reqMin >= 10 && years < 6) failed.push(NEGATIVE_CODES.EXPERIENCE_TOO_LOW);
    else if (reqMin >= 8 && years < 4) failed.push(NEGATIVE_CODES.EXPERIENCE_TOO_LOW);
    else if (years < 0.7 * reqMin && jobSeniorityRank(job) >= 2) {
      // 50–70% of requirement is only allowed for non-senior roles.
      failed.push(NEGATIVE_CODES.EXPERIENCE_TOO_LOW);
    }
  }

  // 3) Seniority gate — leadership/staff+ title the candidate's band doesn't allow.
  const allowsLeadership = profile.seniorityBand ? LEADERSHIP_BANDS.has(profile.seniorityBand) : false;
  if (!allowsLeadership && LEADERSHIP_RE.test(job.title)) {
    failed.push(NEGATIVE_CODES.SENIORITY_TOO_HIGH);
  }

  // 4) Location / workplace gate.
  const isRemoteJob = job.remoteType === "remote" || job.isRemote === true;
  const loc = (job.location ?? "").toLowerCase();
  if (profile.remotePreference === "remote" && !isRemoteJob) {
    failed.push(NEGATIVE_CODES.LOCATION_MISMATCH);
  } else if (profile.places.length && !isRemoteJob && loc) {
    if (!profile.places.some((p) => loc.includes(p))) failed.push(NEGATIVE_CODES.LOCATION_MISMATCH);
  }

  // 5) Work-authorization gate. Job's stated hard requirement vs candidate need.
  const authText = `${job.workAuthorization ?? ""} ${job.description ?? ""}`;
  if (CLEARANCE_RE.test(authText)) failed.push(NEGATIVE_CODES.CLEARANCE_REQUIRED);
  if (profile.requiresSponsorship && NO_SPONSORSHIP_RE.test(authText)) {
    failed.push(NEGATIVE_CODES.WORK_AUTH_CONFLICT);
  }

  // 6) Employment-type gate.
  if (profile.employmentTypePreference.length && job.employmentType) {
    const jt = job.employmentType.toLowerCase();
    if (!profile.employmentTypePreference.some((p) => p.toLowerCase() === jt)) {
      failed.push(NEGATIVE_CODES.EMPLOYMENT_TYPE_MISMATCH);
    }
  }

  // 7) Salary gate (known salary below the candidate's hard minimum).
  if (profile.minSalary && profile.minSalary > 0 && job.salaryMax != null && job.salaryMax < profile.minSalary) {
    failed.push(NEGATIVE_CODES.SALARY_TOO_LOW);
  }

  return { passed: failed.length === 0, failedGates: failed };
}
