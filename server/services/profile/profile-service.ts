import { prisma } from "../../lib/db.js";

// Generic, reusable application fields stored once on the profile.
export type GenericProfileFields = {
  legalFirstName?: string;
  legalLastName?: string;
  preferredName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  personalWebsite?: string;
  requiresSponsorship?: boolean;
  visaStatus?: string;
  currentEmployer?: string;
  currentTitle?: string;
  highestEducation?: string;
  school?: string;
  degree?: string;
  major?: string;
  graduationYear?: string;
  willingToRelocate?: boolean;
  noticePeriod?: string;
  availabilityToStart?: string;
  desiredSalary?: string;
  coverLetterPreference?: string;
  howHeard?: string;
  referralName?: string;
  referralSource?: string;
  gender?: string;
  raceEthnicity?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  consentToDataProcessing?: boolean;
};

export type ProfileInput = {
  fullName: string;
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
};

export async function getProfile(userId: string) {
  return prisma.userProfile.findUnique({ where: { userId } });
}

export async function upsertProfile(userId: string, data: ProfileInput) {
  const payload = {
    fullName: data.fullName,
    phone: data.phone ?? null,
    location: data.location ?? null,
    workAuthorization: data.workAuthorization ?? null,
    yearsExperience: data.yearsExperience ?? null,
    linkedinUrl: data.linkedinUrl ?? null,
    githubUrl: data.githubUrl ?? null,
    portfolioUrl: data.portfolioUrl ?? null,
    summary: data.summary ?? null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skillsJson: (data.skills ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    educationJson: (data.education ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    experienceJson: (data.experience ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    projectsJson: (data.projects ?? []) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    certificationsJson: (data.certifications ?? []) as any,
    ...pickGeneric(data),
  };
  return prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...payload },
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
  return prisma.userPreference.upsert({
    where: { userId },
    create: { userId, ...payload },
    update: payload,
  });
}
