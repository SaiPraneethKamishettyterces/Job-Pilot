import { hasAnthropic, completeJson } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";
import { JOB_PARSE_PROMPT } from "../ai/prompts.js";

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

export async function parseJobDescription(rawText: string, jobUrl?: string): Promise<ParsedJob> {
  if (!hasAnthropic()) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }

  const { data } = await completeJson<Omit<ParsedJob, "jobUrl">>({
    model: TASK_MODEL.jobParse,
    maxTokens: 2048,
    messages: [{ role: "user", content: `${JOB_PARSE_PROMPT}\n\n${rawText.slice(0, 12000)}` }],
  });

  return { ...data, jobUrl: jobUrl ?? null };
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
