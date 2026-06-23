// Thin Apify wrapper. Runs an actor to completion and returns its dataset items.
// Fail-soft (returns [] on any error) and no-op when APIFY_TOKEN is unset, so the
// paid track never breaks the free ingestion run.
import { ApifyClient } from "apify-client";
import { config } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";

let client: ApifyClient | null = null;

export function hasApify(): boolean {
  return Boolean(config.apify.token);
}

function getClient(): ApifyClient {
  if (!client) client = new ApifyClient({ token: config.apify.token });
  return client;
}

/** Run an actor with input and return its dataset items (capped at `maxItems`). */
export async function runActor(
  actorSlug: string,
  input: Record<string, unknown>,
  maxItems: number,
): Promise<Record<string, unknown>[]> {
  if (!hasApify()) return [];
  try {
    const run = await getClient().actor(actorSlug).call(input);
    if (!run?.defaultDatasetId) return [];
    const { items } = await getClient().dataset(run.defaultDatasetId).listItems({ limit: Math.max(1, maxItems) });
    return (items ?? []) as Record<string, unknown>[];
  } catch (err) {
    logger.warn({ actorSlug, err: String(err) }, "Apify actor run failed");
    return [];
  }
}

/** Split a total item budget across N queries (each query gets ≥1). */
export function perQueryBudget(maxItems: number, queries: number): number {
  if (queries <= 0) return maxItems;
  return Math.max(1, Math.floor(maxItems / queries));
}

export function str(o: Record<string, unknown>, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}
