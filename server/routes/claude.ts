import { Router } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { generateCoverLetterStream, countInputTokens } from "../services/ai/ai-service.js";
import { requireAuth } from "../lib/auth-middleware.js";
import { claudeApplySchema } from "../../shared/validation.js";

export const claudeRouter = Router();

// POST /api/claude/apply
// Generates a personalised cover letter / application text, streamed back.
// Auth + validation are required: this triggers a paid Claude call, so it must
// not be an open, unauthenticated, unbounded endpoint (token-burn vector).
claudeRouter.post("/apply", requireAuth, async (req, res) => {
  const parsed = claudeApplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid request" });
    return;
  }
  const { jobDescription, userProfile, tone = "professional" } = parsed.data;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    const stream = generateCoverLetterStream(jobDescription, userProfile, tone);
    let next = await stream.next();
    while (!next.done) {
      res.write(`data: ${JSON.stringify({ text: next.value })}\n\n`);
      next = await stream.next();
    }
    // Generator return value is the final token/cost summary.
    res.write(`data: ${JSON.stringify({ done: true, usage: next.value })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /api/claude/count-tokens
// Estimate cost before sending, using the token counting API.
claudeRouter.post("/count-tokens", requireAuth, async (req, res) => {
  const { messages, system } = req.body as {
    messages: Anthropic.MessageParam[];
    system?: string;
  };

  try {
    const inputTokens = await countInputTokens(messages, system);
    res.json({ inputTokens });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
