import { prisma } from "../../lib/db.js";

// CandidateProfile is the unified, fact-only view of a user that the application
// pipeline (resume tailoring, Q&A, packaging, autofill) consumes. It is the
// TypeScript analog of Job_applying_agent's `UserDetails`, assembled from
// Job-Pilot's normalized tables (User + UserProfile + UserPreference + the
// primary Resume) instead of a BigQuery row.
export interface CandidateProfile {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  email: string | null;
  phone: string | null;
  location: string | null;
  linkedinUrl: string | null;
  githubUrl: string | null;
  portfolioUrl: string | null;
  websiteUrl: string | null;
  currentCompany: string | null;
  currentTitle: string | null;
  yearsOfExperience: number | null;
  highestDegree: string | null;
  schoolName: string | null;
  major: string | null;
  graduationYear: string | null;
  workAuthorization: string | null;
  requiresSponsorship: boolean | null;
  visaStatus: string | null;
  willingToRelocate: boolean | null;
  desiredSalary: string | null;
  noticePeriod: string | null;
  summary: string | null;
  skills: string[];
  education: Array<Record<string, unknown>>;
  experience: Array<Record<string, unknown>>;
  projects: Array<Record<string, unknown>>;
  certifications: string[];
  baseResumeText: string | null;
  coverLetterTemplate: string | null;
  // User-supplied question→answer pairs (stored under preferences.atsPreferencesJson).
  customAnswers: Record<string, string>;
}

function splitName(full: string | null | undefined): { first: string | null; last: string | null } {
  if (!full?.trim()) return { first: null, last: null };
  const parts = full.trim().split(/\s+/);
  if (parts.length === 1) return { first: parts[0] ?? null, last: null };
  return { first: parts[0] ?? null, last: parts.slice(1).join(" ") };
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string");
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Record<string, unknown> => typeof v === "object" && v !== null);
}

function pick(obj: Record<string, unknown> | undefined, ...keys: string[]): string | null {
  if (!obj) return null;
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

/**
 * Load and assemble the unified candidate profile for a user. Returns null only
 * if the user does not exist. A sparse profile is normal — the pipeline must
 * degrade gracefully (escalate to the user) rather than invent missing data.
 */
export async function loadCandidateProfile(userId: string): Promise<CandidateProfile | null> {
  const [user, profile, prefs, resume] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.userPreference.findUnique({ where: { userId } }),
    prisma.resume.findFirst({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  if (!user) return null;

  const fullName = profile?.fullName ?? user.name ?? null;
  const { first, last } = splitName(fullName);

  const experience = asObjectArray(profile?.experienceJson);
  const education = asObjectArray(profile?.educationJson);
  const currentRole = experience[0];
  const topEducation = education[0];

  const atsPrefs = (prefs?.atsPreferencesJson as Record<string, unknown> | undefined) ?? {};
  const rawCustom = atsPrefs["customAnswers"];
  const customAnswers: Record<string, string> = {};
  if (rawCustom && typeof rawCustom === "object" && !Array.isArray(rawCustom)) {
    for (const [k, v] of Object.entries(rawCustom as Record<string, unknown>)) {
      customAnswers[String(k)] = String(v);
    }
  }

  return {
    userId,
    firstName: first,
    lastName: last,
    fullName,
    email: user.email ?? null,
    phone: profile?.phone ?? null,
    location: profile?.location ?? null,
    linkedinUrl: profile?.linkedinUrl ?? null,
    githubUrl: profile?.githubUrl ?? null,
    portfolioUrl: profile?.portfolioUrl ?? null,
    websiteUrl: profile?.portfolioUrl ?? null,
    currentCompany: pick(currentRole, "company", "employer"),
    currentTitle: pick(currentRole, "title", "role", "position"),
    yearsOfExperience: profile?.yearsExperience ?? null,
    highestDegree: pick(topEducation, "degree"),
    schoolName: pick(topEducation, "institution", "school", "university"),
    major: pick(topEducation, "field", "major"),
    graduationYear: pick(topEducation, "endYear", "graduationYear", "endDate"),
    workAuthorization: profile?.workAuthorization ?? null,
    requiresSponsorship: typeof atsPrefs["requiresSponsorship"] === "boolean"
      ? (atsPrefs["requiresSponsorship"] as boolean)
      : null,
    visaStatus: typeof atsPrefs["visaStatus"] === "string" ? (atsPrefs["visaStatus"] as string) : null,
    willingToRelocate: typeof atsPrefs["willingToRelocate"] === "boolean"
      ? (atsPrefs["willingToRelocate"] as boolean)
      : null,
    desiredSalary: prefs?.minSalary ? String(prefs.minSalary) : null,
    noticePeriod: typeof atsPrefs["noticePeriod"] === "string" ? (atsPrefs["noticePeriod"] as string) : null,
    summary: profile?.summary ?? null,
    skills: asStringArray(profile?.skillsJson),
    education,
    experience,
    projects: asObjectArray(profile?.projectsJson),
    certifications: asStringArray(profile?.certificationsJson),
    baseResumeText: resume?.rawText ?? null,
    coverLetterTemplate: typeof atsPrefs["coverLetterTemplate"] === "string"
      ? (atsPrefs["coverLetterTemplate"] as string)
      : null,
    customAnswers,
  };
}

/** Best-effort single-line name from fullName or first+last. */
export function effectiveFullName(p: CandidateProfile): string | null {
  if (p.fullName) return p.fullName;
  const parts = [p.firstName, p.lastName].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** A compact, fact-only profile blurb for AI prompts (mirrors the Python helper). */
export function profileSummary(p: CandidateProfile): string {
  const bits: Array<[string, string | number | null]> = [
    ["Name", effectiveFullName(p)],
    ["Current title", p.currentTitle],
    ["Current company", p.currentCompany],
    ["Years of experience", p.yearsOfExperience],
    ["Highest degree", p.highestDegree],
    ["Major", p.major],
    ["School", p.schoolName],
    ["Location", p.location],
    ["Top skills", p.skills.slice(0, 12).join(", ") || null],
  ];
  const lines = bits.filter(([, v]) => v !== null && v !== "").map(([k, v]) => `- ${k}: ${v}`);
  return lines.length ? lines.join("\n") : "- (no profile fields available)";
}
