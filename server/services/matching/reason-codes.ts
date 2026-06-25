// Structured reason codes attached to every gated / scored job (spec Pt 16), so
// the UI and admin can group and explain decisions ("3 jobs rejected for seniority")
// instead of parsing freeform LLM strings. Positive codes describe strengths;
// negative codes describe gate failures or weak factors.

export const POSITIVE_CODES = {
  ROLE_MATCH_STRONG: "ROLE_MATCH_STRONG",
  EXPERIENCE_MATCH: "EXPERIENCE_MATCH",
  SKILLS_MATCH_STRONG: "SKILLS_MATCH_STRONG",
  ATS_MATCH_HIGH: "ATS_MATCH_HIGH",
  LOCATION_MATCH: "LOCATION_MATCH",
  REMOTE_MATCH: "REMOTE_MATCH",
  WORK_AUTH_COMPATIBLE: "WORK_AUTH_COMPATIBLE",
  DOMAIN_MATCH: "DOMAIN_MATCH",
  FRESH_JOB: "FRESH_JOB",
  DIRECT_ATS_APPLY: "DIRECT_ATS_APPLY",
  LOW_APPLICATION_FRICTION: "LOW_APPLICATION_FRICTION",
} as const;

export const NEGATIVE_CODES = {
  ROLE_MISMATCH: "ROLE_MISMATCH",
  EXPERIENCE_TOO_HIGH: "EXPERIENCE_TOO_HIGH",
  EXPERIENCE_TOO_LOW: "EXPERIENCE_TOO_LOW",
  SENIORITY_TOO_HIGH: "SENIORITY_TOO_HIGH",
  LOCATION_MISMATCH: "LOCATION_MISMATCH",
  WORK_AUTH_CONFLICT: "WORK_AUTH_CONFLICT",
  CLEARANCE_REQUIRED: "CLEARANCE_REQUIRED",
  EMPLOYMENT_TYPE_MISMATCH: "EMPLOYMENT_TYPE_MISMATCH",
  SALARY_TOO_LOW: "SALARY_TOO_LOW",
  DUPLICATE_JOB: "DUPLICATE_JOB",
  OLD_JOB: "OLD_JOB",
  LOW_SKILL_MATCH: "LOW_SKILL_MATCH",
  LOW_ATS_MATCH: "LOW_ATS_MATCH",
  UNSUPPORTED_APPLICATION_FLOW: "UNSUPPORTED_APPLICATION_FLOW",
  LOGIN_REQUIRED: "LOGIN_REQUIRED",
  CAPTCHA_DETECTED: "CAPTCHA_DETECTED",
} as const;

export type PositiveCode = (typeof POSITIVE_CODES)[keyof typeof POSITIVE_CODES];
export type NegativeCode = (typeof NEGATIVE_CODES)[keyof typeof NEGATIVE_CODES];
export type ReasonCode = PositiveCode | NegativeCode;

// Score → status tier (spec Pt 12). REJECTED is set by a failed hard gate,
// independent of the numeric score.
export type StatusTier = "APPLY_NOW" | "STRONG_MATCH" | "GOOD_MATCH" | "BACKUP" | "LOW_PRIORITY" | "REJECTED";

export function statusTierForScore(score: number): StatusTier {
  if (score >= 90) return "APPLY_NOW";
  if (score >= 80) return "STRONG_MATCH";
  if (score >= 70) return "GOOD_MATCH";
  if (score >= 60) return "BACKUP";
  return "LOW_PRIORITY";
}
