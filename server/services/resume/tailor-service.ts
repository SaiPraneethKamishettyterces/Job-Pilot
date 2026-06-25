import { completeJson, hasProvider } from "../ai/ai-service.js";
import { TASK_MODEL, COMPAT_MODELS, type TaskModel } from "../ai/model-config.js";
import { AnthropicBudgetError } from "../ai/budget.js";
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
import { toDocx, toPdf, toMarkdown } from "./resume-renderer.js";
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
  /** Stored PDF artifact ref (same content, ATS-friendly PDF for one-click download). */
  pdfArtifact: StoredArtifact;
  /** Markdown preview of the rendered resume. */
  markdown: string;
}

/** Known skills that literally appear in the JD (deterministic fallback list). */
export function extractSkills(jobDescription: string | null | undefined, limit = 12): string[] {
  if (!jobDescription) return [];
  const text = jobDescription.toLowerCase();
  return SKILL_VOCAB.filter((s) => text.includes(s)).slice(0, limit);
}

// Exported for tests (no-fabrication guardrail on the deterministic path).
export function fallbackContent(baseResumeText: string, jobDescription: string, targetRole?: string | null): unknown {
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
): Promise<{ resume: unknown; analysis: unknown; usedAi: boolean; model: string }> {
  if (skillAvailable()) {
    const system = loadSkillSystemPrompt();
    const prompt = buildTailorUserPrompt({
      baseResumeText: opts.baseResumeText,
      jobDescription: opts.jobDescription,
      userInstructions: opts.userInstructions ?? null,
      targetRole: opts.targetRole ?? null,
    });

    // Attempt order: the configured tailoring model first; when that is Claude,
    // automatically fall back to the local/compat model if Claude is unavailable
    // OR the Anthropic spend cap is hit. This is the budget cutover — quality
    // resumes on Claude until the cap, small-model resumes for the rest.
    const primary = TASK_MODEL.tailorResume;
    const candidates: TaskModel[] =
      primary.provider === "anthropic"
        ? [primary, { provider: "openai", model: COMPAT_MODELS.flash }]
        : [primary];

    for (const m of candidates) {
      if (!hasProvider(m.provider)) continue;
      try {
        const { data, usage } = await completeJson<{ resume?: unknown; analysis?: unknown }>({
          provider: m.provider,
          model: m.model,
          // A full tailored resume (resume + analysis JSON) for a rich base resume
          // exceeds 4k output tokens and truncates → JSON parse fails → fallback.
          // 8k fits a complete resume with headroom.
          maxTokens: 8000,
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
          return { resume: data.resume, analysis: data.analysis ?? {}, usedAi: true, model: m.model };
        }
        logger.warn({ model: m.model }, "skill_llm_no_usable_output");
      } catch (err) {
        const budgetHit = err instanceof AnthropicBudgetError;
        logger.warn(
          { model: m.model, budgetHit, err: String(err) },
          budgetHit
            ? "anthropic budget cap hit — falling back to local model"
            : "resume tailoring attempt failed; trying next model",
        );
      }
    }
  }
  return {
    resume: fallbackContent(opts.baseResumeText, opts.jobDescription, opts.targetRole),
    analysis: fallbackAnalysis(),
    usedAi: false,
    model: "deterministic-fallback",
  };
}

/**
 * Produce the tailored resume as validated structured content — no rendering, no
 * storage, no DB. Shared by `tailorResume` (which renders + stores) and the
 * quality-eval harness (which only needs the content to score coverage). Applies
 * the same validation + contact-override + fallback guarantees as the full path.
 */
export async function tailorResumeContent(opts: TailorOptions): Promise<TailorResult> {
  if (!skillAvailable()) throw new Error("ats-resume-tailoring skill not found; cannot tailor");
  if (!opts.baseResumeText?.trim()) throw new Error("no base resume text");

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

  // Analysis is secondary (a report); never let a malformed analysis block from
  // the model crash tailoring — fall back to schema defaults if it doesn't parse.
  const analysisParsed = atsAnalysisSchema.safeParse(analysisRaw ?? {});
  const analysis = analysisParsed.success ? analysisParsed.data : atsAnalysisSchema.parse({});
  if (!analysisParsed.success) {
    logger.warn({ error: analysisParsed.error.issues[0]?.message }, "ats_analysis_invalid");
  }
  return { resume, analysis, usedAi, model: produced.model };
}

/**
 * Tailor a resume to a JD, render it to DOCX + PDF, and store the artifacts. The
 * ONE place tailoring happens. `contactOverrides` (verified personal info) is
 * force-applied after generation so personal info can never be altered.
 */
export async function tailorResume(
  opts: TailorOptions & { storageJobKey: string },
): Promise<RenderedTailorResult | null> {
  if (!opts.baseResumeText?.trim()) {
    logger.warn("no_base_resume_text");
    return null;
  }

  const { resume, analysis, usedAi, model } = await tailorResumeContent(opts);

  const [docx, pdf] = await Promise.all([toDocx(resume), toPdf(resume)]);
  const [artifact, pdfArtifact] = await Promise.all([
    putArtifact(`${opts.storageJobKey}/tailored_resume.docx`, docx),
    putArtifact(`${opts.storageJobKey}/tailored_resume.pdf`, pdf),
  ]);
  logger.info({ usedAi, model, key: artifact.key, pdfKey: pdfArtifact.key }, "resume_tailored");

  return { resume, analysis, usedAi, model, artifact, pdfArtifact, markdown: toMarkdown(resume) };
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
