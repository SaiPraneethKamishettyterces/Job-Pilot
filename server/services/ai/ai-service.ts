import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "./client.js";
import { summarizeUsage, type TokenSummary } from "./token-tracker.js";
import { MODELS, type ModelId } from "./model-config.js";
import {
  coverLetterSystem,
  coverLetterUser,
  type CoverLetterProfile,
} from "./prompts.js";

export { hasAnthropic } from "./client.js";
export type { TokenSummary } from "./token-tracker.js";

interface CompleteOpts {
  model: ModelId;
  maxTokens: number;
  system?: string;
  messages: Anthropic.MessageParam[];
}

/** Single text completion. Returns the assistant text + a token/cost summary. */
export async function completeText(
  opts: CompleteOpts,
): Promise<{ text: string; usage: TokenSummary }> {
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

/** Extract the first JSON object from model output (tolerates stray prose). */
export function extractJson<T>(text: string): T {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("Claude did not return valid JSON");
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
  model: ModelId;
  maxTokens: number;
  system?: string;
  messages: Anthropic.MessageParam[];
  thinking?: Anthropic.MessageCreateParams["thinking"];
}): AsyncGenerator<string, TokenSummary, void> {
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

/** Count input tokens for a prospective request (cost preview). */
export async function countInputTokens(
  messages: Anthropic.MessageParam[],
  system?: string,
): Promise<number> {
  const client = getAnthropic();
  const result = await client.messages.countTokens({
    model: MODELS.opus,
    ...(system ? { system } : {}),
    messages,
  });
  return result.input_tokens;
}

/** High-level: stream a tailored cover letter paragraph. */
export function generateCoverLetterStream(
  jobDescription: string,
  userProfile: CoverLetterProfile,
  tone = "professional",
): AsyncGenerator<string, TokenSummary, void> {
  return streamText({
    model: MODELS.opus,
    maxTokens: 1024,
    thinking: { type: "adaptive" },
    system: coverLetterSystem(tone),
    messages: [{ role: "user", content: coverLetterUser(jobDescription, userProfile) }],
  });
}
