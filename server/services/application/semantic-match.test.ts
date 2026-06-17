import { describe, it, expect } from "vitest";
import { cosine, bestSemanticMatch, type StoredVec } from "./semantic-match.js";

describe("cosine", () => {
  it("is 1 for identical direction", () => {
    expect(cosine([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 5);
  });
  it("is 0 for orthogonal vectors", () => {
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
  it("is 0 when a vector is all zeros (no divide-by-zero)", () => {
    expect(cosine([0, 0, 0], [1, 2, 3])).toBe(0);
  });
  it("handles differing lengths by comparing the overlap", () => {
    expect(cosine([1, 1, 1], [1, 1])).toBeGreaterThan(0);
  });
});

describe("bestSemanticMatch", () => {
  const stored: StoredVec[] = [
    { question: "Why do you want this role?", answer: "Passion for scalable systems.", vec: [1, 0, 0] },
    { question: "What is your notice period?", answer: "2 weeks.", vec: [0, 1, 0] },
  ];

  it("picks the closest stored question", () => {
    // Query vector near the first stored question.
    const best = bestSemanticMatch([0.9, 0.1, 0], stored);
    expect(best?.answer).toBe("Passion for scalable systems.");
    expect(best?.score).toBeGreaterThan(0.9);
  });

  it("returns null for empty stored set", () => {
    expect(bestSemanticMatch([1, 0, 0], [])).toBeNull();
  });
});
