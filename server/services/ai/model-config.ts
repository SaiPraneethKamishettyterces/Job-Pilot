// Centralized Claude model selection + pricing.
//
// Every Anthropic call in the app picks its model from TASK_MODEL here — never
// hardcode a model id at a call site. Pricing is keyed by the EXACT model id so
// token-tracker cannot silently fall back to the wrong tier (the previous
// "claude-haiku-4-5" vs "claude-haiku-4-5-20251001" mismatch over-billed haiku
// at opus rates).

import { config } from "../../lib/config.js";

// Two providers: Anthropic (Claude — resume tailoring only) and an
// OpenAI-compatible provider (default Google Gemini free tier — everything else).
export type Provider = "anthropic" | "openai";

// Claude model ids (override via ANTHROPIC_MODEL_*).
export const MODELS = {
  opus: config.ai.modelOpus || "claude-opus-4-8",
  sonnet: config.ai.modelSonnet || "claude-sonnet-4-6",
  haiku: config.ai.modelHaiku || "claude-haiku-4-5-20251001",
} as const;

// OpenAI-compatible model ids (override via AI_MODEL_*; default Gemini free tier).
export const COMPAT_MODELS = {
  flash: config.ai.modelFlash || "gemini-2.5-flash",
  pro: config.ai.modelPro || "gemini-2.5-pro",
} as const;

export type ModelId = string;

export interface TaskModel {
  provider: Provider;
  model: string;
}

// USD per 1M tokens, keyed by the resolved model id (so pricing stays correct
// even when a model id is overridden via config). Gemini free tier → 0.
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  [MODELS.opus]: { input: 5.0, output: 25.0 },
  [MODELS.sonnet]: { input: 3.0, output: 15.0 },
  [MODELS.haiku]: { input: 1.0, output: 5.0 },
  [COMPAT_MODELS.flash]: { input: 0, output: 0 },
  [COMPAT_MODELS.pro]: { input: 0, output: 0 },
};

// Fallback price when an unknown model id is seen (conservative: opus rate).
export const FALLBACK_PRICE = { input: 5.0, output: 25.0 };

// Which provider+model each task uses. Resume tailoring stays on the Claude skill
// (quality-sensitive); everything else runs on the free Gemini-tier provider.
//   prose (cover letter) → Gemini Pro; structured/short tasks → Gemini Flash.
export const TASK_MODEL: Record<
  "coverLetter" | "resumeParse" | "jobParse" | "matchScore" | "tailorResume" | "coldEmail" | "questionAnswer",
  TaskModel
> = {
  tailorResume: { provider: "anthropic", model: MODELS.sonnet },
  coverLetter: { provider: "openai", model: COMPAT_MODELS.pro },
  resumeParse: { provider: "openai", model: COMPAT_MODELS.flash },
  jobParse: { provider: "openai", model: COMPAT_MODELS.flash },
  matchScore: { provider: "openai", model: COMPAT_MODELS.flash },
  coldEmail: { provider: "openai", model: COMPAT_MODELS.flash },
  questionAnswer: { provider: "openai", model: COMPAT_MODELS.flash },
};
