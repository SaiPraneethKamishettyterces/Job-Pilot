import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";
import { upsertProfile, type ProfileInput } from "./profile-service.js";

// Persist an uploaded+parsed resume and AUTO-POPULATE the structured profile
// fields from it. This is the bridge that was previously missing: parsing
// returned data to the client but nothing was stored, so `baseResumeText` (used
// by resume tailoring) and the structured profile blocks were always empty.
//
// Population is NON-DESTRUCTIVE: we only fill profile fields that are currently
// blank, so a user's manual edits are never overwritten by a re-upload.

// Loose shape of the RESUME_PARSE_PROMPT JSON (see ai/prompts.ts). All optional.
export interface ParsedResume {
  name?: string;
  email?: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  github?: string;
  summary?: string;
  skills?: string[];
  experience?: Array<{
    company?: string;
    title?: string;
    startDate?: string;
    endDate?: string;
    isCurrent?: boolean;
    description?: string;
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    startYear?: number | string;
    endYear?: number | string;
  }>;
  projects?: Array<Record<string, unknown>>;
  certifications?: string[];
}

export interface ResumeFileMeta {
  fileName: string;
  fileType: string;
  originalFileUrl: string;
  rawText: string;
}

function str(v: unknown): string | undefined {
  if (typeof v === "string" && v.trim()) return v.trim();
  if (typeof v === "number") return String(v);
  return undefined;
}

/** Persist the Resume row, returning its id. Marks primary if it's the first. */
export async function persistResume(userId: string, parsed: ParsedResume | null, meta: ResumeFileMeta): Promise<string> {
  const existingPrimary = await prisma.resume.findFirst({ where: { userId, isPrimary: true } });
  const resume = await prisma.resume.create({
    data: {
      userId,
      fileName: meta.fileName,
      originalFileUrl: meta.originalFileUrl,
      fileType: meta.fileType,
      rawText: meta.rawText,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      parsedJson: (parsed ?? undefined) as any,
      isPrimary: !existingPrimary,
    },
  });
  return resume.id;
}

/**
 * Merge parsed-resume data into the user's profile, filling ONLY blank fields.
 * Returns the list of profile keys that were populated (for logging/telemetry).
 */
export async function applyParsedResumeToProfile(userId: string, parsed: ParsedResume): Promise<string[]> {
  const existing = await prisma.userProfile.findUnique({ where: { userId } });

  const update: ProfileInput = {};
  const filled: string[] = [];
  const fillScalar = (key: keyof ProfileInput, current: unknown, value: string | undefined) => {
    const isBlank = current === null || current === undefined || (typeof current === "string" && current.trim() === "");
    if (isBlank && value) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (update as any)[key] = value;
      filled.push(String(key));
    }
  };
  const fillArray = (key: keyof ProfileInput, current: unknown, value: unknown[] | undefined) => {
    const cur = Array.isArray(current) ? current : [];
    if (cur.length === 0 && value && value.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (update as any)[key] = value;
      filled.push(String(key));
    }
  };

  // Required on create — always pass a name so a brand-new profile is valid.
  update.fullName = existing?.fullName || str(parsed.name) || "";

  fillScalar("phone", existing?.phone, str(parsed.phone));
  fillScalar("location", existing?.location, str(parsed.location));
  fillScalar("linkedinUrl", existing?.linkedinUrl, str(parsed.linkedin));
  fillScalar("githubUrl", existing?.githubUrl, str(parsed.github));
  fillScalar("summary", existing?.summary, str(parsed.summary));

  // Structured blocks.
  fillArray("skills", existing?.skillsJson, (parsed.skills ?? []).filter((s) => typeof s === "string"));
  fillArray("experience", existing?.experienceJson, parsed.experience);
  fillArray("education", existing?.educationJson, parsed.education);
  fillArray("projects", existing?.projectsJson, parsed.projects);
  fillArray("certifications", existing?.certificationsJson, parsed.certifications);

  // Derive the generic "current employer/title" + education fields used by ATS
  // autofill from the most relevant resume entries (only if still blank).
  const current = (parsed.experience ?? []).find((e) => e.isCurrent) ?? parsed.experience?.[0];
  fillScalar("currentEmployer", existing?.currentEmployer, str(current?.company));
  fillScalar("currentTitle", existing?.currentTitle, str(current?.title));

  const topEdu = parsed.education?.[0];
  fillScalar("degree", existing?.degree, str(topEdu?.degree));
  fillScalar("school", existing?.school, str(topEdu?.institution));
  fillScalar("major", existing?.major, str(topEdu?.field));
  fillScalar("graduationYear", existing?.graduationYear, str(topEdu?.endYear));

  // Only one populated key (fullName carrier) means nothing else to write — but
  // upsert is still safe/cheap and ensures the profile row exists.
  await upsertProfile(userId, update);
  if (filled.length) logger.info({ userId, filled }, "Auto-populated profile from resume");
  return filled;
}

/** Full ingest: persist the file row and auto-populate the profile. */
export async function ingestResume(
  userId: string,
  parsed: ParsedResume | null,
  meta: ResumeFileMeta,
): Promise<{ resumeId: string; filledFields: string[] }> {
  const resumeId = await persistResume(userId, parsed, meta);
  const filledFields = parsed ? await applyParsedResumeToProfile(userId, parsed) : [];
  return { resumeId, filledFields };
}
