import { config } from "../../lib/config.js";
import type { Anthropic } from "@anthropic-ai/sdk";
import { summarizeUsage, type TokenSummary } from "./token-tracker.js";

// OpenAI-compatible provider over plain fetch (no SDK, so no peer-dep conflicts).
// Targets Google Gemini's free tier by default; works with any OpenAI-compatible
// endpoint (Groq / OpenRouter / Ollama) by changing AI_COMPAT_BASE_URL.

export function hasCompat(): boolean {
  return Boolean(config.ai.compatApiKey);
}

function baseUrl(): string {
  // Normalize to no trailing slash so we can append /chat/completions etc.
  return config.ai.compatBaseUrl.replace(/\/+$/, "");
}

function authHeaders(): Record<string, string> {
  if (!config.ai.compatApiKey) throw new Error("AI_COMPAT_API_KEY is not configured");
  return { "Content-Type": "application/json", Authorization: `Bearer ${config.ai.compatApiKey}` };
}

// Coerce Anthropic-style message content (string | content blocks) to plain text.
function contentToText(content: Anthropic.MessageParam["content"]): string {
  if (typeof content === "string") return content;
  return content
    .map((b) => (b.type === "text" ? b.text : ""))
    .filter(Boolean)
    .join("\n");
}

function toChatMessages(
  system: string | undefined,
  messages: Anthropic.MessageParam[],
): Array<{ role: string; content: string }> {
  const out: Array<{ role: string; content: string }> = [];
  if (system) out.push({ role: "system", content: system });
  for (const m of messages) out.push({ role: m.role, content: contentToText(m.content) });
  return out;
}

export interface CompatCompleteOpts {
  model: string;
  maxTokens: number;
  system?: string;
  messages: Anthropic.MessageParam[];
}

/** Non-streaming chat completion via the OpenAI-compatible endpoint. */
export async function compatComplete(
  opts: CompatCompleteOpts,
): Promise<{ text: string; usage: TokenSummary }> {
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      messages: toChatMessages(opts.system, opts.messages),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  const usage = summarizeUsage(opts.model, {
    input_tokens: json.usage?.prompt_tokens ?? 0,
    output_tokens: json.usage?.completion_tokens ?? 0,
  });
  return { text, usage };
}

/** Streaming chat completion. Yields text deltas; returns the final usage. */
export async function* compatStream(
  opts: CompatCompleteOpts,
): AsyncGenerator<string, TokenSummary, void> {
  const res = await fetch(`${baseUrl()}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      messages: toChatMessages(opts.system, opts.messages),
    }),
  });
  if (!res.ok || !res.body) {
    const detail = res.body ? await res.text().catch(() => "") : "";
    throw new Error(`AI provider error ${res.status}: ${detail.slice(0, 300)}`);
  }

  let inTok = 0;
  let outTok = 0;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    // SSE frames are separated by a blank line; each has one or more `data:` lines.
    const frames = buf.split("\n\n");
    buf = frames.pop() ?? "";
    for (const frame of frames) {
      for (const line of frame.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const evt = JSON.parse(payload) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const delta = evt.choices?.[0]?.delta?.content;
          if (delta) yield delta;
          if (evt.usage) {
            inTok = evt.usage.prompt_tokens ?? inTok;
            outTok = evt.usage.completion_tokens ?? outTok;
          }
        } catch {
          // Ignore non-JSON keep-alive frames.
        }
      }
    }
  }
  return summarizeUsage(opts.model, { input_tokens: inTok, output_tokens: outTok });
}

/** Embed one or more texts. Returns a vector per input (same order). */
export async function compatEmbed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch(`${baseUrl()}/embeddings`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ model: config.ai.embedModel, input: texts }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AI embeddings error ${res.status}: ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { data?: Array<{ embedding: number[]; index: number }> };
  const rows = (json.data ?? []).slice().sort((a, b) => a.index - b.index);
  return rows.map((r) => r.embedding);
}
