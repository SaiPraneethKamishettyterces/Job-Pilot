import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../lib/env.js";
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

const SCORE_PROMPT = `You are a job-fit evaluator. Score how well a candidate matches a job posting.

Return ONLY valid JSON (no markdown, no explanation):
{
  "score": number (0-100),
  "decision": "SHORTLIST" | "REVIEW" | "SKIP",
  "reasons": string[] (max 4 strengths),
  "risks": string[] (max 3 concerns or gaps)
}

Decision thresholds (threshold = candidate's matchThreshold setting):
- SHORTLIST: score >= threshold AND strong skill alignment
- REVIEW: score >= threshold - 15, moderate alignment
- SKIP: score < threshold - 15, OR blocked company, OR hard disqualification

Scoring guidance:
- Skill overlap (40%): how many required skills does the candidate have?
- Experience (25%): does years of experience fit the range?
- Location/remote (15%): does remote preference and location align?
- Role fit (10%): is the role in their target roles?
- Work auth + salary (10%): hard requirements met?

Be realistic. Most strong applications score 65-85. Reserve 90+ for near-perfect.`;

export async function scoreJobMatch(
  job: ParsedJob,
  profile: ProfileSnapshot
): Promise<MatchResult> {
  if (!env.ANTHROPIC_API_KEY) {
    const score = 65;
    return {
      score,
      decision: score >= profile.matchThreshold ? "SHORTLIST" : "REVIEW",
      reasons: ["Mock score — set ANTHROPIC_API_KEY for real scoring"],
      risks: [],
    };
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

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

  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 512,
    messages: [{ role: "user", content: `${SCORE_PROMPT}\n\n${context}` }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  return JSON.parse(jsonMatch[0]) as MatchResult;
}
