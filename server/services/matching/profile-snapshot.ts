import { prisma } from "../../lib/db.js";
import { loadCandidateProfile } from "../profile/candidate-profile.js";
import type { ProfileSnapshot } from "./match-scorer.js";

// Builds the rich candidate snapshot the scorer uses — real experience, projects,
// and education formatted as text (so matching judges fit from the whole resume,
// not just a skills list). Shared by the pipeline and the manual /jobs route.

function str(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}
function bullets(o: Record<string, unknown>): string[] {
  const raw = o["highlights"] ?? o["bullets"] ?? o["achievements"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}
function fmtExperience(items: Array<Record<string, unknown>>): string[] {
  return items.slice(0, 8).map((e) => {
    const title = str(e, "title", "role", "position") ?? "";
    const company = str(e, "company", "employer");
    const start = str(e, "startDate", "start", "startYear");
    const end = str(e, "endDate", "end", "endYear") ?? (e["current"] ? "Present" : null);
    const dates = [start, end].filter(Boolean).join("–");
    const detail = bullets(e).slice(0, 3).join("; ") || str(e, "description", "summary") || "";
    const head = [title, company && `at ${company}`, dates && `(${dates})`].filter(Boolean).join(" ");
    return detail ? `${head} — ${detail}` : head;
  }).filter((l) => l.trim().length > 0);
}
function fmtEducation(items: Array<Record<string, unknown>>): string[] {
  return items.slice(0, 5).map((e) => {
    const deg = str(e, "degree");
    const field = str(e, "field", "major");
    const school = str(e, "institution", "school", "university");
    const year = str(e, "endYear", "graduationYear", "endDate");
    return [deg, field && `in ${field}`, school && `, ${school}`, year && `(${year})`].filter(Boolean).join(" ");
  }).filter((l) => l.trim().length > 0);
}
function fmtProjects(items: Array<Record<string, unknown>>): string[] {
  return items.slice(0, 6).map((e) => {
    const name = str(e, "name", "title") ?? "";
    const desc = str(e, "description", "summary") ?? "";
    return desc ? `${name}: ${desc}` : name;
  }).filter((l) => l.trim().length > 0);
}

export async function buildProfileSnapshot(userId: string): Promise<ProfileSnapshot> {
  const [cp, prefs] = await Promise.all([
    loadCandidateProfile(userId),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
  return {
    skills: cp?.skills ?? [],
    yearsExperience: cp?.yearsOfExperience ?? null,
    summary: cp?.summary ?? null,
    workAuthorization: cp?.workAuthorization ?? null,
    targetRoles: (prefs?.targetRolesJson as string[] | undefined) ?? [],
    blockedCompanies: (prefs?.blockedCompaniesJson as string[] | undefined) ?? [],
    remotePreference: prefs?.remotePreference ?? "any",
    minSalary: prefs?.minSalary ?? null,
    matchThreshold: prefs?.matchThreshold ?? 70,
    currentTitle: cp?.currentTitle ?? null,
    experience: cp ? fmtExperience(cp.experience) : [],
    education: cp ? fmtEducation(cp.education) : [],
    projects: cp ? fmtProjects(cp.projects) : [],
    certifications: cp?.certifications ?? [],
  };
}
