import { completeText, hasAnthropic } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";
import {
  coverLetterSystem,
  coverLetterUser,
  COLD_EMAIL_SYSTEM,
  buildColdEmailPrompt,
  type CoverLetterProfile,
} from "../ai/prompts.js";
import { recordUsage } from "../ai/usage-recorder.js";
import { effectiveFullName, profileSummary, type CandidateProfile } from "../profile/candidate-profile.js";

// Non-streaming document generators used by the application pipeline. (The
// interactive UI still uses the SSE generateCoverLetterStream in ai-service.)

interface GenCtx {
  userId: string;
  runId?: string | null;
  applicationId?: string | null;
}

function coverProfile(p: CandidateProfile): CoverLetterProfile {
  return {
    name: effectiveFullName(p) ?? "",
    skills: p.skills.slice(0, 20),
    experience: p.summary ?? `${p.currentTitle ?? ""} ${p.currentCompany ? `at ${p.currentCompany}` : ""}`.trim(),
    ...(p.currentTitle ? { targetRole: p.currentTitle } : {}),
  };
}

/** Generate a tailored cover letter paragraph. Returns null if AI is unavailable. */
export async function generateCoverLetter(
  jobDescription: string,
  profile: CandidateProfile,
  ctx: GenCtx,
  tone = "professional",
): Promise<string | null> {
  if (!hasAnthropic()) return null;
  const { text, usage } = await completeText({
    model: TASK_MODEL.coverLetter,
    maxTokens: 1024,
    system: coverLetterSystem(tone),
    messages: [{ role: "user", content: coverLetterUser(jobDescription, coverProfile(profile)) }],
  });
  await recordUsage({ ...ctx, featureName: "cover_letter_generation", usage });
  return text.trim() || null;
}

/** Generate a cold outreach email body. Returns null if AI is unavailable. */
export async function generateColdEmail(
  jobTitle: string,
  company: string,
  jobDescription: string | null,
  profile: CandidateProfile,
  ctx: GenCtx,
): Promise<string | null> {
  if (!hasAnthropic()) return null;
  const { text, usage } = await completeText({
    model: TASK_MODEL.coldEmail,
    maxTokens: 512,
    system: COLD_EMAIL_SYSTEM,
    messages: [
      {
        role: "user",
        content: buildColdEmailPrompt({ jobTitle, company, jobDescription, profileSummary: profileSummary(profile) }),
      },
    ],
  });
  await recordUsage({ ...ctx, featureName: "cold_email_generation", usage });
  return text.trim() || null;
}
