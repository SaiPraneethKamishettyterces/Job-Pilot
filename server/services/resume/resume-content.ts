import { z } from "zod";

// Zod mirror of server/skills/ats-resume-tailoring/references/resume_content_schema.json.
// Lenient (passthrough-tolerant) so a slightly richer model response still parses —
// the equivalent of the Python models' `extra="ignore"`. This is the engine-side
// guard that the model returned usable content before we render it.

export const contactSchema = z.object({
  name: z.string().default(""),
  location: z.string().nullish(),
  phone: z.string().nullish(),
  email: z.string().nullish(),
  links: z.array(z.string()).default([]),
});

export const skillCategorySchema = z.object({
  category: z.string().default(""),
  items: z.array(z.string()).default([]),
});

export const experienceSchema = z.object({
  title: z.string().default(""),
  company: z.string().default(""),
  location: z.string().nullish(),
  dates: z.string().nullish(),
  bullets: z.array(z.string()).default([]),
});

export const projectSchema = z.object({
  name: z.string().default(""),
  tools: z.array(z.string()).default([]),
  dates: z.string().nullish(),
  bullets: z.array(z.string()).default([]),
});

export const educationSchema = z.object({
  degree: z.string().default(""),
  institution: z.string().default(""),
  location: z.string().nullish(),
  dates: z.string().nullish(),
  details: z.string().nullish(),
});

export const resumeContentSchema = z.object({
  contact: contactSchema.default({ name: "", links: [] }),
  professional_summary: z.string().default(""),
  technical_skills: z.array(skillCategorySchema).default([]),
  experience: z.array(experienceSchema).default([]),
  projects: z.array(projectSchema).default([]),
  education: z.array(educationSchema).default([]),
  certifications: z.array(z.string()).default([]),
});

export const atsAnalysisSchema = z.object({
  role_type: z.string().default(""),
  ats_match_estimate: z.record(z.string(), z.unknown()).default({}),
  strongest_matches: z.array(z.string()).default([]),
  weak_or_missing: z.array(z.string()).default([]),
  matched_keywords: z.array(z.string()).default([]),
  missing_keywords: z.array(z.string()).default([]),
  changes_made: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
});

export type Contact = z.infer<typeof contactSchema>;
export type ResumeContent = z.infer<typeof resumeContentSchema>;
export type ATSAnalysis = z.infer<typeof atsAnalysisSchema>;

export interface TailorResult {
  resume: ResumeContent;
  analysis: ATSAnalysis;
  usedAi: boolean;
  /** The model that produced the content (e.g. "claude-sonnet-4-6", "qwen2.5:3b",
   *  or "deterministic-fallback") — lets the UI/ledger tell Claude vs small-model. */
  model: string;
}
