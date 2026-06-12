import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../lib/env.js";

export type ParsedJob = {
  title: string;
  company: string;
  location: string | null;
  isRemote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  description: string;
  requirements: string[];
  skills: string[];
  experienceMin: number | null;
  experienceMax: number | null;
  atsPlatform: string | null;
  workAuthorization: string | null;
  jobUrl: string | null;
};

const PARSE_PROMPT = `You are a job description parser. Extract structured information from the job posting below.

Return ONLY valid JSON (no markdown fences, no explanation) matching this schema:
{
  "title": string,
  "company": string,
  "location": string | null,
  "isRemote": boolean,
  "salaryMin": number | null,
  "salaryMax": number | null,
  "salaryCurrency": string | null,
  "description": string,
  "requirements": string[],
  "skills": string[],
  "experienceMin": number | null,
  "experienceMax": number | null,
  "atsPlatform": string | null,
  "workAuthorization": string | null
}

Rules:
- "skills": technical/soft skills explicitly stated, max 20 items
- "requirements": must-have qualifications, max 10 items, each ≤ 100 chars
- "experienceMin/Max": years of experience if stated (null if not)
- "atsPlatform": Greenhouse/Lever/Workday/Ashby/Taleo etc if detectable
- "description": first 500 chars of the role description
- "salaryCurrency": USD/GBP/EUR/CAD etc if mentioned
- Only extract explicitly stated info. Do not invent.

Job Posting:`;

export async function parseJobDescription(rawText: string, jobUrl?: string): Promise<ParsedJob> {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 2048,
    messages: [{ role: "user", content: `${PARSE_PROMPT}\n\n${rawText.slice(0, 12000)}` }],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected Claude response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const parsed = JSON.parse(jsonMatch[0]) as Omit<ParsedJob, "jobUrl">;
  return { ...parsed, jobUrl: jobUrl ?? null };
}

export async function fetchUrlText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; JobPilot/1.0)",
      Accept: "text/html,application/xhtml+xml,text/plain",
    },
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Failed to fetch URL (${res.status}): ${url}`);
  const html = await res.text();
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z]+;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 15000);
}
