import Anthropic from "@anthropic-ai/sdk";
import { env } from "../../lib/env.js";

// Single shared Anthropic client for the whole app. Lazily constructed so the
// server still boots without ANTHROPIC_API_KEY (call sites that can degrade
// gracefully should guard with hasAnthropic() first).

let client: Anthropic | null = null;

export function hasAnthropic(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}

export function getAnthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY is not configured");
  }
  if (!client) {
    client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }
  return client;
}
