import { config } from "dotenv";
config();

function required(key: string): string {
  const v = process.env[key];
  if (!v) throw new Error(`Missing required environment variable: ${key}`);
  return v;
}

function optional(key: string, fallback = ""): string {
  return process.env[key] ?? fallback;
}

export const env = {
  PORT: parseInt(optional("PORT", "3001")),
  UI_ORIGIN: optional("UI_ORIGIN", "http://localhost:5173"),
  ANTHROPIC_API_KEY: optional("ANTHROPIC_API_KEY"),
  DATABASE_URL: optional("DATABASE_URL"),
  JWT_SECRET: optional("JWT_SECRET", "dev-secret-change-in-production"),
  NODE_ENV: optional("NODE_ENV", "development"),
  // Artifact storage: local-disk directory for generated documents (resumes,
  // packages). Empty → defaults to <repo>/artifacts. GCS_BUCKET_NAME is reserved
  // for the future GCS-backed implementation of artifact-storage.ts.
  STORAGE_DIR: optional("STORAGE_DIR"),
  GCS_BUCKET_NAME: optional("GCS_BUCKET_NAME"),
  // Browser automation: gate that actually submits forms. Off by default — the
  // safety model is "prepare, the user submits" (mirrors the Python AUTO_SUBMIT).
  AUTO_SUBMIT: optional("AUTO_SUBMIT", "false") === "true",
};
