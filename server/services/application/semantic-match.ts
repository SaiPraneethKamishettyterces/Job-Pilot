// Pure vector helpers for semantic matching of application questions to stored
// answers. Kept separate from qa-generator so they're unit-testable with no I/O.

export function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface StoredVec {
  question: string;
  answer: string;
  vec: number[];
}

/** Best cosine match between the query vector and the stored-question vectors. */
export function bestSemanticMatch(
  qVec: number[],
  stored: StoredVec[],
): { question: string; answer: string; score: number } | null {
  let best: { question: string; answer: string; score: number } | null = null;
  for (const s of stored) {
    const score = cosine(qVec, s.vec);
    if (!best || score > best.score) best = { question: s.question, answer: s.answer, score };
  }
  return best;
}
