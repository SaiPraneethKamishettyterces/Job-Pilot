import { hasProvider, completeJson } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";
import { SCORE_PROMPT } from "../ai/prompts.js";
import type { ParsedJob } from "../job-discovery/job-parser.js";

export type MatchResult = {
  score: number;
  decision: "SHORTLIST" | "REVIEW" | "SKIP";
  reasons: string[];
  risks: string[];
};

// Rich candidate context for scoring — the scorer judges fit from the real
// resume (experience entries, projects, education), not just a skills list.
export type ProfileSnapshot = {
  skills: string[];
  tools: string[];
  yearsExperience: number | null;
  summary: string | null;
  workAuthorization: string | null;
  requiresSponsorship: boolean;
  targetRoles: string[];
  acceptableAdjacentRoles: string[];
  excludedRoles: string[];
  seniorityBand: string | null;
  employmentTypePreference: string[];
  domains: string[];
  industries: string[];
  blockedCompanies: string[];
  remotePreference: string;
  places: string[]; // accepted location substrings (lowercased), "remote" stripped
  minSalary: number | null;
  matchThreshold: number;
  currentTitle: string | null;
  experience: string[]; // pre-formatted "Title at Company (dates) — highlights"
  education: string[]; // pre-formatted lines
  projects: string[]; // pre-formatted lines
  certifications: string[];
};

function section(label: string, lines: string[]): string[] {
  if (!lines.length) return [];
  return [`${label}:`, ...lines.map((l) => `  - ${l}`)];
}

export async function scoreJobMatch(
  job: ParsedJob,
  profile: ProfileSnapshot,
): Promise<MatchResult> {
  if (!hasProvider(TASK_MODEL.matchScore.provider)) {
    const score = 65;
    return {
      score,
      decision: score >= profile.matchThreshold ? "SHORTLIST" : "REVIEW",
      reasons: ["Mock score — configure the AI provider (AI_COMPAT_API_KEY) for real scoring"],
      risks: [],
    };
  }

  const context = [
    "=== JOB ===",
    `Role: ${job.title} at ${job.company}`,
    `Location: ${job.location ?? "Not specified"} | Remote: ${job.isRemote}`,
    `Experience required: ${job.experienceMin ?? "?"}–${job.experienceMax ?? "?"} years`,
    `Required skills: ${job.skills.slice(0, 20).join(", ") || "Not listed"}`,
    `Work auth: ${job.workAuthorization ?? "Not specified"}`,
    `Salary: ${job.salaryMin ? `${job.salaryCurrency ?? "USD"} ${job.salaryMin}–${job.salaryMax}` : "Not specified"}`,
    "",
    "=== CANDIDATE ===",
    `Current title: ${profile.currentTitle ?? "Unknown"}`,
    `Total experience: ${profile.yearsExperience ?? "Unknown"} years`,
    `Target roles: ${profile.targetRoles.slice(0, 5).join(", ") || "Any"}`,
    `Remote preference: ${profile.remotePreference}`,
    `Work auth: ${profile.workAuthorization ?? "Not specified"}`,
    `Min salary: ${profile.minSalary ?? "Not specified"}`,
    `Blocked companies: ${profile.blockedCompanies.join(", ") || "None"}`,
    `Match threshold: ${profile.matchThreshold}%`,
    ...(profile.summary ? ["", `Summary: ${profile.summary}`] : []),
    `Skills: ${profile.skills.slice(0, 40).join(", ") || "None listed"}`,
    ...section("Experience", profile.experience),
    ...section("Projects", profile.projects),
    ...section("Education", profile.education),
    ...(profile.certifications.length ? [`Certifications: ${profile.certifications.join(", ")}`] : []),
  ].join("\n");

  const { data } = await completeJson<MatchResult>({
    ...TASK_MODEL.matchScore,
    maxTokens: 512,
    messages: [{ role: "user", content: `${SCORE_PROMPT}\n\n${context}` }],
  });

  return data;
}
