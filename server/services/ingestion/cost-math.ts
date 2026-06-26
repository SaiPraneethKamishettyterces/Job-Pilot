// Pure cost-attribution math for job pulling (admin cost tracking). Kept dependency-
// free so it's unit-testable without a DB or network. Used by the Apify wrapper
// (per-job acquisition cost) and the embedder (per-row embedding cost).

const CHARS_PER_TOKEN = 4; // rough token estimate for embedding cost

/**
 * Amortize a scraper call's total spend across the items it returned, so each new
 * posting can be stamped with its share. Guards against divide-by-zero (a call that
 * returned nothing has unit cost 0). You "paid to fetch" every returned item, dup or
 * not — so this divides by itemsReturned, not itemsNew.
 */
export function amortizeUnitCost(costUsd: number, itemsReturned: number): number {
  if (costUsd <= 0) return 0;
  return costUsd / Math.max(1, itemsReturned);
}

/** Estimated USD to embed `textLength` chars at a $/1M-token rate (0 ⇒ free tier). */
export function estimateEmbedCostUsd(textLength: number, usdPerMillionTokens: number, charsPerToken = CHARS_PER_TOKEN): number {
  if (usdPerMillionTokens <= 0 || textLength <= 0) return 0;
  const tokens = Math.ceil(textLength / charsPerToken);
  return (tokens / 1_000_000) * usdPerMillionTokens;
}

/** Fraction of scraped items that were duplicates (the dedup-waste signal). */
export function dedupRatio(duplicates: number, scraped: number): number | null {
  if (scraped <= 0) return null;
  return duplicates / scraped;
}
