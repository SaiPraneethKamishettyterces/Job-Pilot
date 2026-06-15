import { hasAnthropic, completeJson } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";
import { SCORE_PROMPT } from "../ai/prompts.js";
import type { ParsedJob } from "../job-discovery/job-parser.js";

export type MatchResult = {
  score: number;
  decision: "SHORTLIST" | "REVIEW" | "SKIP";
  reasons: string[];
  risks: string[];
};

export type ProfileSnapshot = {
  skills: string[];
  yearsExperience: number | null;
  summary: string | null;
  workAuthorization: string | null;
  targetRoles: string[];
  blockedCompanies: string[];
  remotePreference: string;
  minSalary: number | null;
  matchThreshold: number;
};

export async function scoreJobMatch(
  job: ParsedJob,
  profile: ProfileSnapshot
): Promise<MatchResult> {
  if (!hasAnthropic()) {
    const score = 65;
    return {
      score,
      decision: score >= profile.matchThreshold ? "SHORTLIST" : "REVIEW",
      reasons: ["Mock score — set ANTHROPIC_API_KEY for real scoring"],
      risks: [],
    };
  }

  const context = [
    "=== JOB ===",
    `Role: ${job.title} at ${job.company}`,
    `Location: ${job.location ?? "Not specified"} | Remote: ${job.isRemote}`,
    `Experience required: ${job.experienceMin ?? "?"}–${job.experienceMax ?? "?"} years`,
    `Required skills: ${job.skills.slice(0, 15).join(", ") || "Not listed"}`,
    `Work auth: ${job.workAuthorization ?? "Not specified"}`,
    `Salary: ${job.salaryMin ? `${job.salaryCurrency ?? "USD"} ${job.salaryMin}–${job.salaryMax}` : "Not specified"}`,
    "",
    "=== CANDIDATE ===",
    `Experience: ${profile.yearsExperience ?? "Unknown"} years`,
    `Skills: ${profile.skills.slice(0, 20).join(", ") || "None listed"}`,
    `Work auth: ${profile.workAuthorization ?? "Not specified"}`,
    `Target roles: ${profile.targetRoles.slice(0, 5).join(", ") || "Any"}`,
    `Remote preference: ${profile.remotePreference}`,
    `Min salary: ${profile.minSalary ?? "Not specified"}`,
    `Blocked companies: ${profile.blockedCompanies.join(", ") || "None"}`,
    `Match threshold: ${profile.matchThreshold}%`,
  ].join("\n");

  const { data } = await completeJson<MatchResult>({
    model: TASK_MODEL.matchScore,
    maxTokens: 512,
    messages: [{ role: "user", content: `${SCORE_PROMPT}\n\n${context}` }],
  });

  return data;
}
