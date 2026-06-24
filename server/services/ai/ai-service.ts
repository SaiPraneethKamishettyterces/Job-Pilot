import type { Anthropic } from "@anthropic-ai/sdk";
import { getAnthropic, hasAnthropic } from "./client.js";
import { compatComplete, compatStream, hasCompat } from "./openai-provider.js";
import { summarizeUsage, type TokenSummary } from "./token-tracker.js";
import { TASK_MODEL, type Provider } from "./model-config.js";
import { assertWithinAnthropicBudget } from "./budget.js";
import {
  coverLetterSystem,
  coverLetterUser,
  type CoverLetterProfile,
} from "./prompts.js";

export { hasAnthropic } from "./client.js";
export { hasCompat, compatEmbed } from "./openai-provider.js";
export type { TokenSummary } from "./token-tracker.js";

/** Is the provider backing a given task configured (has a key)? */
export function hasProvider(provider: Provider): boolean {
  return provider === "anthropic" ? hasAnthropic() : hasCompat();
}

interface CompleteOpts {
  provider: Provider;
  model: string;
  maxTokens: number;
  system?: string;
  messages: Anthropic.MessageParam[];
}

async function anthropicComplete(
  opts: CompleteOpts,
): Promise<{ text: string; usage: TokenSummary }> {
  // Enforce the spend cap before incurring any Anthropic cost.
  await assertWithinAnthropicBudget();
  const client = getAnthropic();
  const response = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(opts.system ? { system: opts.system } : {}),
    messages: opts.messages,
  });
  const content = response.content[0];
  if (!content || content.type !== "text") {
    throw new Error("Unexpected Claude response type");
  }
  return { text: content.text, usage: summarizeUsage(opts.model, response.usage) };
}

/** Single text completion. Routes to the task's provider. */
export async function completeText(
  opts: CompleteOpts,
): Promise<{ text: string; usage: TokenSummary }> {
  return opts.provider === "anthropic" ? anthropicComplete(opts) : compatComplete(opts);
}

/** Extract the first JSON object from model output (tolerates stray prose). */
export function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Model did not return valid JSON");
  return JSON.parse(match[0]) as T;
}

/** Text completion whose response is parsed as JSON of type T. */
export async function completeJson<T>(
  opts: CompleteOpts,
): Promise<{ data: T; usage: TokenSummary }> {
  const { text, usage } = await completeText(opts);
  return { data: extractJson<T>(text), usage };
}

/**
 * Streaming text completion. Yields text deltas; the generator's return value
 * is the final TokenSummary once the stream completes.
 */
export async function* streamText(opts: {
  provider: Provider;
  model: string;
  maxTokens: number;
  system?: string;
  messages: Anthropic.MessageParam[];
  thinking?: Anthropic.MessageCreateParams["thinking"];
}): AsyncGenerator<string, TokenSummary, void> {
  if (opts.provider === "openai") {
    return yield* compatStream(opts);
  }

  await assertWithinAnthropicBudget();
  const client = getAnthropic();
  const stream = client.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    ...(opts.system ? { system: opts.system } : {}),
    ...(opts.thinking ? { thinking: opts.thinking } : {}),
    messages: opts.messages,
  });

  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield event.delta.text;
    }
  }

  const final = await stream.finalMessage();
  return summarizeUsage(opts.model, final.usage);
}

/**
 * Estimate input tokens for a prospective request (cost preview only). The
 * OpenAI-compatible endpoint has no token-count API, so this is a cheap
 * heuristic (~4 chars/token) good enough for a UI preview.
 */
export async function countInputTokens(
  messages: Anthropic.MessageParam[],
  system?: string,
): Promise<number> {
  const text =
    (system ?? "") +
    messages
      .map((m) => (typeof m.content === "string" ? m.content : JSON.stringify(m.content)))
      .join("\n");
  return Math.ceil(text.length / 4);
}

/** High-level: stream a tailored cover letter paragraph. */
export function generateCoverLetterStream(
  jobDescription: string,
  userProfile: CoverLetterProfile,
  tone = "professional",
): AsyncGenerator<string, TokenSummary, void> {
  return streamText({
    ...TASK_MODEL.coverLetter,
    maxTokens: 1024,
    system: coverLetterSystem(tone),
    messages: [{ role: "user", content: coverLetterUser(jobDescription, userProfile) }],
  });
}
