import { completeJson, hasAnthropic } from "../ai/ai-service.js";
import { TASK_MODEL } from "../ai/model-config.js";
import { buildTailorUserPrompt } from "../ai/prompts.js";
import { recordUsage } from "../ai/usage-recorder.js";
import { logger } from "../../lib/logger.js";
import { loadSkillSystemPrompt, skillAvailable } from "./skill-loader.js";
import {
  resumeContentSchema,
  atsAnalysisSchema,
  contactSchema,
  type ResumeContent,
  type Contact,
  type TailorResult,
} from "./resume-content.js";
import { toDocx, toMarkdown } from "./resume-renderer.js";
import { putArtifact, type StoredArtifact } from "../storage/artifact-storage.js";
import { effectiveFullName, type CandidateProfile } from "../profile/candidate-profile.js";

// Resume tailoring — the single chokepoint that routes through the skill.
// Ported from Job_applying_agent/resume/resume_tailor.py. There is no resume
// prompt here: the system prompt is loaded from the ats-resume-tailoring skill,
// and deterministic formatting is owned by resume-renderer.ts. When the LLM is
// unavailable a deterministic fallback produces a valid — but explicitly NOT
// tailored — structured resume so the pipeline never hard-fails.

const SKILL_VOCAB = [
  "python", "java", "javascript", "typescript", "go", "sql", "nosql",
  "postgresql", "mysql", "mongodb", "bigquery", "snowflake", "redshift",
  "spark", "pyspark", "hadoop", "kafka", "airflow", "dbt", "etl", "elt",
  "aws", "gcp", "azure", "docker", "kubernetes", "terraform", "ci/cd",
  "react", "django", "flask", "fastapi", "tableau", "power bi", "looker",
  "machine learning", "tensorflow", "pytorch", "pandas", "numpy",
  "data modeling", "data engineering", "data analysis", "git", "jira", "agile",
];
const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_RE = /(\+?\d[\d\s().-]{7,}\d)/;
const URL_RE = /(https?:\/\/[^\s|]+|(?:www\.|linkedin\.com|github\.com)[^\s|]+)/g;

export interface TailorOptions {
  baseResumeText: string;
  jobDescription: string;
  userInstructions?: string | null;
  targetRole?: string | null;
  /** Verified personal info force-applied AFTER generation (never altered by AI). */
  contactOverrides?: Partial<Contact> | null;
  /** Usage-tracking context. */
  userId: string;
  runId?: string | null;
  applicationId?: string | null;
}

export interface RenderedTailorResult extends TailorResult {
  /** Stored DOCX artifact ref. */
  artifact: StoredArtifact;
  /** Markdown preview of the rendered resume. */
  markdown: string;
}

/** Known skills that literally appear in the JD (deterministic fallback list). */
export function extractSkills(jobDescription: string | null | undefined, limit = 12): string[] {
  if (!jobDescription) return [];
  const text = jobDescription.toLowerCase();
  return SKILL_VOCAB.filter((s) => text.includes(s)).slice(0, limit);
}

function fallbackContent(baseResumeText: string, jobDescription: string, targetRole?: string | null): unknown {
  const text = baseResumeText.trim();
  const name = text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  const email = EMAIL_RE.exec(text)?.[0] ?? null;
  const phone = PHONE_RE.exec(text)?.[1]?.trim() ?? null;
  const links = [...new Set(text.match(URL_RE) ?? [])].slice(0, 3);
  const skills = extractSkills(jobDescription);
  const bullets = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\t\-•]+/, "").trim())
    .filter((l) => l.length > 25)
    .slice(0, 12);

  return {
    contact: { name, email, phone, links },
    professional_summary:
      `Experienced professional targeting ${targetRole || "the role"}. ` +
      "(Generated without AI - content reflects the base resume verbatim.)",
    technical_skills: skills.length ? [{ category: "Core Skills", items: skills }] : [],
    experience: bullets.length
      ? [{ title: targetRole || "Professional Experience", company: "", bullets }]
      : [],
    education: [],
  };
}

function fallbackAnalysis(): unknown {
  return {
    role_type: "Unknown",
    ats_match_estimate: {
      percent: null,
      reasoning:
        "AI unavailable - deterministic passthrough, not tailored. " +
        "Set ANTHROPIC_API_KEY for real ATS tailoring.",
    },
    changes_made: ["None - base resume passed through with consistent formatting only."],
    recommendations: ["Configure ANTHROPIC_API_KEY to enable full skill-based tailoring."],
  };
}

async function produceContent(
  opts: TailorOptions,
): Promise<{ resume: unknown; analysis: unknown; usedAi: boolean }> {
  if (hasAnthropic() && skillAvailable()) {
    const system = loadSkillSystemPrompt();
    const prompt = buildTailorUserPrompt({
      baseResumeText: opts.baseResumeText,
      jobDescription: opts.jobDescription,
      userInstructions: opts.userInstructions ?? null,
      targetRole: opts.targetRole ?? null,
    });
    try {
      const { data, usage } = await completeJson<{ resume?: unknown; analysis?: unknown }>({
        model: TASK_MODEL.tailorResume,
        maxTokens: 4000,
        system,
        messages: [{ role: "user", content: prompt }],
      });
      await recordUsage({
        userId: opts.userId,
        runId: opts.runId ?? null,
        applicationId: opts.applicationId ?? null,
        featureName: "resume_tailoring",
        usage,
      });
      if (data && typeof data.resume === "object" && data.resume !== null) {
        return { resume: data.resume, analysis: data.analysis ?? {}, usedAi: true };
      }
      logger.warn("skill_llm_no_usable_output");
    } catch (err) {
      logger.warn({ err: String(err) }, "resume tailoring LLM call failed; using fallback");
    }
  }
  return {
    resume: fallbackContent(opts.baseResumeText, opts.jobDescription, opts.targetRole),
    analysis: fallbackAnalysis(),
    usedAi: false,
  };
}

/**
 * Tailor a resume to a JD, render it to DOCX, and store the artifact. The ONE
 * place tailoring happens. `contactOverrides` (verified personal info) is
 * force-applied after generation so personal info can never be altered.
 */
export async function tailorResume(
  opts: TailorOptions & { storageJobKey: string },
): Promise<RenderedTailorResult | null> {
  if (!skillAvailable()) throw new Error("ats-resume-tailoring skill not found; cannot tailor");
  if (!opts.baseResumeText?.trim()) {
    logger.warn("no_base_resume_text");
    return null;
  }

  const produced = await produceContent(opts);

  // Validate model output; on failure, drop to the deterministic fallback.
  let resume: ResumeContent;
  let analysisRaw = produced.analysis;
  let usedAi = produced.usedAi;
  const parsed = resumeContentSchema.safeParse(produced.resume);
  if (parsed.success) {
    resume = parsed.data;
  } else {
    logger.warn({ error: parsed.error.issues[0]?.message }, "resume_content_invalid");
    resume = resumeContentSchema.parse(
      fallbackContent(opts.baseResumeText, opts.jobDescription, opts.targetRole),
    );
    analysisRaw = fallbackAnalysis();
    usedAi = false;
  }

  // Enforce: personal info is never changed by the model.
  if (opts.contactOverrides) {
    resume.contact = contactSchema.parse({ ...resume.contact, ...opts.contactOverrides });
  }

  const analysis = atsAnalysisSchema.parse(analysisRaw ?? {});

  const docx = await toDocx(resume);
  const artifact = await putArtifact(`${opts.storageJobKey}/tailored_resume.docx`, docx);
  logger.info({ usedAi, key: artifact.key }, "resume_tailored");

  return { resume, analysis, usedAi, artifact, markdown: toMarkdown(resume) };
}

/** Build the contact-override block from a candidate profile (verified info). */
export function contactFromProfile(p: CandidateProfile): Partial<Contact> {
  return {
    name: effectiveFullName(p) ?? "",
    location: p.location ?? undefined,
    phone: p.phone ?? undefined,
    email: p.email ?? undefined,
    links: [p.linkedinUrl, p.githubUrl, p.portfolioUrl ?? p.websiteUrl].filter(
      (u): u is string => Boolean(u),
    ),
  };
}
