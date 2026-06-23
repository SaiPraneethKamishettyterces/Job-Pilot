// Deterministic title/role matching helpers, relocated from the per-user
// ingestion path into matching (where per-user preferences now live). Used by the
// stage-B reranker's cheap feature score.

// Seniority / filler words dropped from a target role before matching — they
// shouldn't be REQUIRED (a "Senior AI Engineer" target should still match an
// "AI Engineer" posting).
const ROLE_FILLER = new Set(
  "senior junior staff lead principal head director sr jr i ii iii iv v of and or for the a an to in at on with".split(" "),
);

/** Light stem so engineer/engineering/engineers compare equal. */
export function stem(w: string): string {
  return w.replace(/(ing|ers|er|s)$/, "");
}

export function titleWords(title: string): Set<string> {
  return new Set(title.toLowerCase().split(/[^a-z0-9+#]+/).filter(Boolean).map(stem));
}

/** Each target role → the set of meaningful (non-filler) stemmed tokens it requires. */
export function roleSpecs(roles: string[]): string[][] {
  const specs: string[][] = [];
  for (const r of roles) {
    const toks = r
      .toLowerCase()
      .split(/[^a-z0-9+#]+/)
      .filter(Boolean)
      .filter((w) => w.length >= 2 && !ROLE_FILLER.has(w))
      .map(stem);
    if (toks.length) specs.push([...new Set(toks)]);
  }
  return specs;
}

/** True if the title contains ALL tokens of at least one target-role spec. */
export function matchesRole(title: string, specs: string[][]): boolean {
  if (specs.length === 0) return true;
  const words = titleWords(title);
  return specs.some((spec) => spec.every((tok) => words.has(tok)));
}

/** Fraction in [0,1] of the best target-role spec's tokens present in the title. */
export function titleOverlap(title: string, specs: string[][]): number {
  if (specs.length === 0) return 0.5; // no target → neutral
  const words = titleWords(title);
  let best = 0;
  for (const spec of specs) {
    const hit = spec.filter((tok) => words.has(tok)).length / spec.length;
    if (hit > best) best = hit;
  }
  return best;
}
