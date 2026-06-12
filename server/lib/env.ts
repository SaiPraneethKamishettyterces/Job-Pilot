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
};
