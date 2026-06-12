import { prisma } from "../../lib/db.js";

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
};

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
