// Centralized Claude model selection + pricing.
//
// Every Anthropic call in the app picks its model from TASK_MODEL here — never
// hardcode a model id at a call site. Pricing is keyed by the EXACT model id so
// token-tracker cannot silently fall back to the wrong tier (the previous
// "claude-haiku-4-5" vs "claude-haiku-4-5-20251001" mismatch over-billed haiku
// at opus rates).

export const MODELS = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

// USD per 1M tokens, keyed by exact model id.
export const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  [MODELS.opus]: { input: 5.0, output: 25.0 },
  [MODELS.sonnet]: { input: 3.0, output: 15.0 },
  [MODELS.haiku]: { input: 1.0, output: 5.0 },
};

// Fallback price when an unknown model id is seen (conservative: opus rate).
export const FALLBACK_PRICE = { input: 5.0, output: 25.0 };

// Which model each task uses. Preserves the models the app shipped with:
//   cover letter → opus, resume parse → sonnet, job parse + scoring → haiku.
export const TASK_MODEL = {
  coverLetter: MODELS.opus,
  resumeParse: MODELS.sonnet,
  jobParse: MODELS.haiku,
  matchScore: MODELS.haiku,
} as const;
