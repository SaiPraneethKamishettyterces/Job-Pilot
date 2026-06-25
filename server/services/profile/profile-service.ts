import { prisma } from "../../lib/db.js";

// Generic, reusable application fields stored once on the profile. Values may be
// `null` (explicit clear) or `undefined` (leave as-is) for partial updates.
type Nullable<T> = T | null | undefined;
export type GenericProfileFields = {
  legalFirstName?: Nullable<string>;
  legalLastName?: Nullable<string>;
  preferredName?: Nullable<string>;
  addressLine1?: Nullable<string>;
  addressLine2?: Nullable<string>;
  city?: Nullable<string>;
  state?: Nullable<string>;
  zipCode?: Nullable<string>;
  country?: Nullable<string>;
  personalWebsite?: Nullable<string>;
  requiresSponsorship?: Nullable<boolean>;
  visaStatus?: Nullable<string>;
  currentEmployer?: Nullable<string>;
  currentTitle?: Nullable<string>;
  highestEducation?: Nullable<string>;
  school?: Nullable<string>;
  degree?: Nullable<string>;
  major?: Nullable<string>;
  graduationYear?: Nullable<string>;
  willingToRelocate?: Nullable<boolean>;
  noticePeriod?: Nullable<string>;
  availabilityToStart?: Nullable<string>;
  desiredSalary?: Nullable<string>;
  coverLetterPreference?: Nullable<string>;
  howHeard?: Nullable<string>;
  referralName?: Nullable<string>;
  referralSource?: Nullable<string>;
  gender?: Nullable<string>;
  raceEthnicity?: Nullable<string>;
  veteranStatus?: Nullable<string>;
  disabilityStatus?: Nullable<string>;
  consentToDataProcessing?: boolean;
};

export type ProfileInput = {
  // Optional so partial-update callers (e.g. resume auto-populate, the
  // Application Details tab) need not resend it. Profile creation paths
  // (onboarding, full profile save) always provide it, validated upstream.
  fullName?: string;
  phone?: string;
  location?: string;
  workAuthorization?: string;
  yearsExperience?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary?: string;
  skills?: unknown[];
  education?: unknown[];
  experience?: unknown[];
  projects?: unknown[];
  certifications?: string[];
  // Candidate level + skill taxonomy used by hard gates + factor scoring.
  seniorityBand?: string | null;
  tools?: string[];
  cloudPlatforms?: string[];
  secondarySkills?: string[];
  domains?: string[];
  industries?: string[];
} & GenericProfileFields;

// Keys of the generic block — used to pass only defined values through to Prisma.
const GENERIC_KEYS = [
  "legalFirstName", "legalLastName", "preferredName", "addressLine1", "addressLine2",
  "city", "state", "zipCode", "country", "personalWebsite", "requiresSponsorship",
  "visaStatus", "currentEmployer", "currentTitle", "highestEducation", "school",
  "degree", "major", "graduationYear", "willingToRelocate", "noticePeriod",
  "availabilityToStart", "desiredSalary", "coverLetterPreference", "howHeard",
  "referralName", "referralSource", "gender", "raceEthnicity", "veteranStatus",
  "disabilityStatus", "consentToDataProcessing",
] as const;

function pickGeneric(data: GenericProfileFields): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of GENERIC_KEYS) {
    const v = (data as Record<string, unknown>)[k];
    if (v !== undefined) out[k] = v;
  }
  if (data.consentToDataProcessing) out["consentAt"] = new Date();
  return out;
}

export type PreferencesInput = {
  targetRoles?: string[];
  targetCompanies?: string[];
  blockedCompanies?: string[];
  locations?: string[];
  remotePreference?: string;
  minSalary?: number;
  maxSalary?: number;
  applicationsPerDay?: number;
  approvalMode?: "AUTO_APPLY" | "ASSISTED_APPLY" | "ALWAYS_REVIEW" | "DRAFT_ONLY";
  matchThreshold?: number;
  // Hard-gate inputs (optional; only written when provided).
  acceptableAdjacentRoles?: string[];
  excludedRoles?: string[];
  employmentTypePreference?: string[];
  preferredSources?: string[];
  excludedSources?: string[];
};

export async function getProfile(userId: string) {
  return prisma.userProfile.findUnique({ where: { userId } });
}

export async function upsertProfile(userId: string, data: ProfileInput) {
  // Partial-update semantics: only fields the caller actually provided are
  // written. This lets independent surfaces (Personal Info tab, Application
  // Details tab, resume auto-populate) each save their own slice without
  // clobbering the others. To clear a value, send null (survives JSON);
  // `undefined` (absent key) means "leave as-is".
  const payload: Record<string, unknown> = {};
  const setIf = (key: string, v: unknown) => {
    if (v !== undefined) payload[key] = v;
  };
  setIf("fullName", data.fullName);
  setIf("phone", data.phone);
  setIf("location", data.location);
  setIf("workAuthorization", data.workAuthorization);
  setIf("yearsExperience", data.yearsExperience);
  setIf("linkedinUrl", data.linkedinUrl);
  setIf("githubUrl", data.githubUrl);
  setIf("portfolioUrl", data.portfolioUrl);
  setIf("summary", data.summary);
  if (data.skills !== undefined) payload["skillsJson"] = data.skills;
  if (data.education !== undefined) payload["educationJson"] = data.education;
  if (data.experience !== undefined) payload["experienceJson"] = data.experience;
  if (data.projects !== undefined) payload["projectsJson"] = data.projects;
  if (data.certifications !== undefined) payload["certificationsJson"] = data.certifications;
  setIf("seniorityBand", data.seniorityBand);
  if (data.tools !== undefined) payload["toolsJson"] = data.tools;
  if (data.cloudPlatforms !== undefined) payload["cloudPlatformsJson"] = data.cloudPlatforms;
  if (data.secondarySkills !== undefined) payload["secondarySkillsJson"] = data.secondarySkills;
  if (data.domains !== undefined) payload["domainsJson"] = data.domains;
  if (data.industries !== undefined) payload["industriesJson"] = data.industries;
  Object.assign(payload, pickGeneric(data));

  return prisma.userProfile.upsert({
    where: { userId },
    // fullName is required by the schema; callers that create a profile always
    // pass it (validated upstream). Fall back to "" only to satisfy the type.
    create: { userId, fullName: data.fullName ?? "", ...payload },
    update: payload,
  });
}

export async function getPreferences(userId: string) {
  return prisma.userPreference.findUnique({ where: { userId } });
}

export async function upsertPreferences(userId: string, data: PreferencesInput) {
  const payload = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    targetRolesJson: (data.targetRoles ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    targetCompaniesJson: (data.targetCompanies ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    blockedCompaniesJson: (data.blockedCompanies ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    locationsJson: (data.locations ?? []) as any,
    remotePreference: data.remotePreference ?? "any",
    minSalary: data.minSalary ?? null,
    maxSalary: data.maxSalary ?? null,
    applicationsPerDay: data.applicationsPerDay ?? 10,
    approvalMode: (data.approvalMode ?? "ALWAYS_REVIEW") as
      | "AUTO_APPLY"
      | "ASSISTED_APPLY"
      | "ALWAYS_REVIEW"
      | "DRAFT_ONLY",
    matchThreshold: data.matchThreshold ?? 70,
  };
  // New gate-input arrays: only written when the caller actually provided them, so
  // a partial preferences save never wipes them. (eslint: prisma Json typing)
  const extra: Record<string, unknown> = {};
  if (data.acceptableAdjacentRoles !== undefined) extra["acceptableAdjacentRolesJson"] = data.acceptableAdjacentRoles;
  if (data.excludedRoles !== undefined) extra["excludedRolesJson"] = data.excludedRoles;
  if (data.employmentTypePreference !== undefined) extra["employmentTypePreferenceJson"] = data.employmentTypePreference;
  if (data.preferredSources !== undefined) extra["preferredSourcesJson"] = data.preferredSources;
  if (data.excludedSources !== undefined) extra["excludedSourcesJson"] = data.excludedSources;
  return prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...payload, ...extra },
    update: { ...payload, ...extra },
  });
}
