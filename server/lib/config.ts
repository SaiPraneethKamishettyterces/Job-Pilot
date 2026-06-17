import { config as loadDotenv } from "dotenv";
loadDotenv();

// ─────────────────────────────────────────────────────────────────────────────
// Centralized configuration — the SINGLE source of truth for all server config.
// Every server module imports from here (or from ./env.js, which re-exports the
// flat `env` view). NEVER read process.env or hardcode keys/URLs elsewhere.
//
// Secrets come from environment variables (see .env.example). Safe, non-secret
// defaults are provided so the app boots in dev/test without a full .env.
// ─────────────────────────────────────────────────────────────────────────────

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}
function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}
function num(key: string, fallback: number): number {
  const v = process.env[key];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
function bool(key: string, fallback = false): boolean {
  const v = process.env[key];
  if (v == null) return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

export type AppMode = "development" | "test" | "production";

const NODE_ENV = (optional("NODE_ENV", "development") as AppMode);

export const config = {
  // ── Environment / mode ──────────────────────────────────────────────────
  env: NODE_ENV,
  isProd: NODE_ENV === "production",
  isTest: NODE_ENV === "test",
  isDev: NODE_ENV === "development",

  // ── HTTP / URLs ─────────────────────────────────────────────────────────
  server: {
    port: num("PORT", 3001),
    uiOrigin: optional("UI_ORIGIN", "http://localhost:5173"),
    // Public base URL of the API (used to build Stripe redirect/return URLs).
    publicUrl: optional("PUBLIC_URL", optional("UI_ORIGIN", "http://localhost:5173")),
    logLevel: optional("LOG_LEVEL", "info"),
  },

  // ── Database (PostgreSQL) ───────────────────────────────────────────────
  database: {
    url: optional("DATABASE_URL"),
  },

  // ── Auth ────────────────────────────────────────────────────────────────
  auth: {
    jwtSecret: optional("JWT_SECRET", "dev-secret-change-in-production"),
    jwtExpiresIn: optional("JWT_EXPIRES_IN", "7d"),
    bcryptRounds: num("BCRYPT_ROUNDS", 10),
  },

  // ── AI providers ──────────────────────────────────────────────────────────
  ai: {
    // Anthropic / Claude — used for resume tailoring (the Claude skill).
    apiKey: optional("ANTHROPIC_API_KEY"),
    // Optional per-task model overrides (else model-config.ts defaults apply).
    modelOpus: optional("ANTHROPIC_MODEL_OPUS"),
    modelSonnet: optional("ANTHROPIC_MODEL_SONNET"),
    modelHaiku: optional("ANTHROPIC_MODEL_HAIKU"),

    // OpenAI-compatible provider for everything else (default: Google Gemini free
    // tier). Point compatBaseUrl at Groq / OpenRouter / Ollama to switch later.
    compatBaseUrl: optional("AI_COMPAT_BASE_URL", "https://generativelanguage.googleapis.com/v1beta/openai/"),
    compatApiKey: optional("AI_COMPAT_API_KEY"),
    modelFlash: optional("AI_MODEL_FLASH", "gemini-2.5-flash"),
    modelPro: optional("AI_MODEL_PRO", "gemini-2.5-pro"),
    embedModel: optional("AI_EMBED_MODEL", "text-embedding-004"),
  },

  // ── Stripe (subscriptions / payments) ───────────────────────────────────
  stripe: {
    secretKey: optional("STRIPE_SECRET_KEY"),
    webhookSecret: optional("STRIPE_WEBHOOK_SECRET"),
    publishableKey: optional("STRIPE_PUBLISHABLE_KEY"),
    // Price ids per plan slug (Stripe test or live price ids).
    prices: {
      starter: optional("STRIPE_PRICE_STARTER"),
      pro: optional("STRIPE_PRICE_PRO"),
    } as Record<string, string>,
    successUrl: optional("STRIPE_SUCCESS_URL"), // falls back to <uiOrigin>/billing?status=success
    cancelUrl: optional("STRIPE_CANCEL_URL"),
  },

  // ── Artifact storage (generated documents) ──────────────────────────────
  // Generated document bytes are stored in Postgres (the Artifact table) — no
  // external object store. Only the upload size cap is configurable here.
  storage: {
    maxUploadMb: num("MAX_UPLOAD_MB", 8),
  },

  // ── Automation / pipeline ───────────────────────────────────────────────
  automation: {
    // "assisted" (default, supported prod mode): prepare the autofill package +
    //   documents and hand off to the user — no headless browser, so the image
    //   stays small and Cloud Run memory stays low. "auto": opt-in headless
    //   Playwright form-fill (requires Chromium in the image + ≥1GiB memory).
    mode: (optional("AUTOMATION_MODE", "assisted") === "auto" ? "auto" : "assisted") as "assisted" | "auto",
    autoSubmit: bool("AUTO_SUBMIT", false),
    maxJobsPerRun: num("MAX_JOBS_PER_RUN", 60),
    // Daily application cap fallback when a user has no preference set.
    defaultApplicationsPerDay: num("DEFAULT_APPLICATIONS_PER_DAY", 10),
    // Background retry of applications that failed during document generation.
    retry: {
      enabled: bool("RETRY_WORKER_ENABLED", NODE_ENV !== "test"),
      intervalMinutes: num("RETRY_INTERVAL_MINUTES", 15),
      maxAttempts: num("RETRY_MAX_ATTEMPTS", 3),
      batchSize: num("RETRY_BATCH_SIZE", 10),
      // A pipeline run left in a non-terminal state longer than this is treated
      // as stuck (e.g. the instance that started it was recycled) and recovered.
      stuckRunMinutes: num("STUCK_RUN_MINUTES", 20),
    },
    // Daily auto-apply scheduler: once per day at `hour` (server-local), start a
    // run for every active subscriber who hasn't already had a scheduled run that
    // day. In-process (like retry); off in test.
    scheduler: {
      enabled: bool("DAILY_SCHEDULER_ENABLED", NODE_ENV !== "test"),
      hour: num("DAILY_RUN_HOUR", 8), // server-local hour 0–23
      checkIntervalMinutes: num("DAILY_SCHEDULER_INTERVAL_MINUTES", 30),
    },
  },

  // ── Notifications (email) ─────────────────────────────────────────────────
  // No provider keys required for local/test: the default transport logs the
  // message. Set NOTIFY_EMAIL_TRANSPORT=smtp + SMTP_* to wire a real provider.
  notifications: {
    emailEnabled: bool("NOTIFY_EMAIL_ENABLED", true),
    emailTransport: optional("NOTIFY_EMAIL_TRANSPORT", "log"), // log | smtp
    fromAddress: optional("NOTIFY_FROM_ADDRESS", "JobPilot <no-reply@jobpilot.local>"),
    smtp: {
      host: optional("SMTP_HOST"),
      port: num("SMTP_PORT", 587),
      secure: bool("SMTP_SECURE", false),
      user: optional("SMTP_USER"),
      pass: optional("SMTP_PASS"),
    },
  },
} as const;

export function hasStripe(): boolean {
  return Boolean(config.stripe.secretKey);
}

// Allowed CORS origins, parsed from UI_ORIGIN (comma-separated for multiple
// environments). "*" means reflect any origin — acceptable for a Bearer-token
// API but should be pinned to the real UI domain(s) in production.
export function corsOrigins(): string[] {
  return config.server.uiOrigin
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function stripeSuccessUrl(): string {
  return config.stripe.successUrl || `${config.server.uiOrigin}/billing?status=success`;
}
export function stripeCancelUrl(): string {
  return config.stripe.cancelUrl || `${config.server.uiOrigin}/billing?status=cancelled`;
}

// Flat back-compat view consumed by existing modules via ./env.js.
export const env = {
  PORT: config.server.port,
  UI_ORIGIN: config.server.uiOrigin,
  ANTHROPIC_API_KEY: config.ai.apiKey,
  DATABASE_URL: config.database.url,
  JWT_SECRET: config.auth.jwtSecret,
  NODE_ENV: config.env,
  AUTO_SUBMIT: config.automation.autoSubmit,
};

export { required };
