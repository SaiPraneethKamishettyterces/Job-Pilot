import { Router } from "express";
import Anthropic from "@anthropic-ai/sdk";
import { summarizeUsage } from "../lib/token-tracker.js";

export const claudeRouter = Router();

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// POST /api/claude/apply
// Generates a personalised cover letter / application text, streamed back.
claudeRouter.post("/apply", async (req, res) => {
  const { jobDescription, userProfile, tone = "professional" } = req.body as {
    jobDescription: string;
    userProfile: {
      name: string;
      skills: string[];
      experience: string;
      targetRole?: string;
    };
    tone?: string;
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const systemPrompt = `You are an expert job-application coach. Write compelling, honest, ${tone} application materials.
Always personalise content to the candidate's actual background — never fabricate experience.
Output only the requested text, no meta-commentary.`;

  const userMessage = `Job description:
${jobDescription}

Candidate profile:
Name: ${userProfile.name}
Skills: ${userProfile.skills.join(", ")}
Experience: ${userProfile.experience}
${userProfile.targetRole ? `Target role: ${userProfile.targetRole}` : ""}

Write a tailored cover letter paragraph (3-4 sentences) that highlights the strongest match between this candidate and the role.`;

  try {
    const stream = anthropic.messages.stream({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      system: systemPrompt,
      messages: [{ role: "user", content: userMessage }],
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    const final = await stream.finalMessage();
    const usage = summarizeUsage("claude-opus-4-8", final.usage);
    res.write(`data: ${JSON.stringify({ done: true, usage })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: String(err) })}\n\n`);
  } finally {
    res.end();
  }
});

// POST /api/claude/count-tokens
// Estimate cost before sending, using the token counting API.
claudeRouter.post("/count-tokens", async (req, res) => {
  const { messages, system } = req.body as {
    messages: Anthropic.MessageParam[];
    system?: string;
  };

  try {
    const result = await anthropic.messages.countTokens({
      model: "claude-opus-4-8",
      system,
      messages,
    });
    res.json({ inputTokens: result.input_tokens });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
