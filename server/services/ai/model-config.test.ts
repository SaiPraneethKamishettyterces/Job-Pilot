import { describe, it, expect } from "vitest";
import { TASK_MODEL } from "./model-config.js";
import { hasProvider } from "./ai-service.js";

// Provider routing: resume tailoring stays on Claude; everything else runs on the
// OpenAI-compatible (Gemini) provider.
describe("TASK_MODEL provider routing", () => {
  it("keeps resume tailoring on Anthropic (the Claude skill)", () => {
    expect(TASK_MODEL.tailorResume.provider).toBe("anthropic");
  });

  it("routes all non-tailoring tasks to the openai-compatible provider", () => {
    const others = ["coverLetter", "resumeParse", "jobParse", "matchScore", "coldEmail", "questionAnswer"] as const;
    for (const task of others) {
      expect(TASK_MODEL[task].provider).toBe("openai");
    }
  });

  it("every task has a non-empty model id", () => {
    for (const t of Object.values(TASK_MODEL)) {
      expect(typeof t.model).toBe("string");
      expect(t.model.length).toBeGreaterThan(0);
    }
  });
});

describe("hasProvider gating", () => {
  it("returns false for both providers when no keys are configured (test env)", () => {
    // No ANTHROPIC_API_KEY / AI_COMPAT_API_KEY in the test environment.
    expect(hasProvider("anthropic")).toBe(false);
    expect(hasProvider("openai")).toBe(false);
  });
});
