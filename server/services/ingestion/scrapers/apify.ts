// Thin Apify wrapper. Runs an actor to completion and returns its dataset items.
// Fail-soft (returns [] on any error) and no-op when APIFY_TOKEN is unset, so the
// paid track never breaks the free ingestion run.
import { ApifyClient } from "apify-client";
import { config } from "../../../lib/config.js";
import { logger } from "../../../lib/logger.js";
import { canSpendApify, estimateRunCostUsd, recordApifySpend } from "../apify-budget.js";
import { recordScraperEvent, type ScraperStatus } from "../scraper-usage.js";
import { amortizeUnitCost } from "../cost-math.js";

let client: ApifyClient | null = null;

export function hasApify(): boolean {
  return Boolean(config.apify.token);
}

function getClient(): ApifyClient {
  if (!client) client = new ApifyClient({ token: config.apify.token });
  return client;
}

/** Result of one actor invocation, carrying the cost attribution for the caller. */
export type ActorRun = {
  items: Record<string, unknown>[];
  costUsd: number;
  /** costUsd amortized per returned item — stamped onto each posting as acquisition cost. */
  unitCostUsd: number;
  durationMs: number;
  estimated: boolean;
  status: ScraperStatus;
};

export type RunActorOpts = {
  /** Cost attribution key (linkedin | indeed | hiringcafe). Defaults to actorSlug. */
  sourceKey?: string;
  /** GlobalIngestRun this call belongs to (for the per-call ledger). */
  runId?: string | null;
  /** The keyword/search term that drove this call (per-keyword cost drill-down). */
  query?: string | null;
};

/**
 * Run an actor with input and return its dataset items (capped at `maxItems`) plus
 * the call's cost attribution. Enforces the hard daily spend cap BEFORE running and
 * records real-dollar spend + a per-call ScraperUsageEvent after — so a real Apify
 * token can never run uncapped and every call is auditable.
 */
export async function runActor(
  actorSlug: string,
  input: Record<string, unknown>,
  maxItems: number,
  opts: RunActorOpts = {},
): Promise<ActorRun> {
  const source = opts.sourceKey ?? actorSlug;
  const empty = (status: ScraperStatus, durationMs = 0): ActorRun => ({
    items: [],
    costUsd: 0,
    unitCostUsd: 0,
    durationMs,
    estimated: false,
    status,
  });
  if (!hasApify()) return empty("ok");
  // Hard spend cap — skip the paid run entirely once today's budget is exhausted.
  if (!(await canSpendApify())) {
    await recordScraperEvent({ runId: opts.runId, kind: "apify", source, actorName: actorSlug, query: opts.query, status: "capped" });
    return empty("capped");
  }
  const start = Date.now();
  try {
    const run = await getClient().actor(actorSlug).call(input);
    if (!run?.defaultDatasetId) {
      await recordScraperEvent({ runId: opts.runId, kind: "apify", source, actorName: actorSlug, query: opts.query, durationMs: Date.now() - start });
      return empty("ok", Date.now() - start);
    }
    const { items } = await getClient().dataset(run.defaultDatasetId).listItems({ limit: Math.max(1, maxItems) });
    const results = (items ?? []) as Record<string, unknown>[];
    const durationMs = Date.now() - start;
    // Attribute spend (prefer the actor-reported usage; else a per-result fallback).
    const reported = (run as { usageTotalUsd?: number | null }).usageTotalUsd;
    const estimated = !(typeof reported === "number" && reported > 0);
    const costUsd = estimateRunCostUsd(run as { usageTotalUsd?: number | null }, results.length);
    const unitCostUsd = amortizeUnitCost(costUsd, results.length);
    await recordApifySpend(source, actorSlug, costUsd, results.length);
    await recordScraperEvent({
      runId: opts.runId, kind: "apify", source, actorName: actorSlug, query: opts.query,
      itemsReturned: results.length, costUsd, estimated, durationMs, status: "ok",
    });
    return { items: results, costUsd, unitCostUsd, durationMs, estimated, status: "ok" };
  } catch (err) {
    const durationMs = Date.now() - start;
    logger.warn({ actorSlug, err: String(err) }, "Apify actor run failed");
    await recordScraperEvent({
      runId: opts.runId, kind: "apify", source, actorName: actorSlug, query: opts.query,
      durationMs, status: "error", errorMessage: String(err),
    });
    return empty("error", durationMs);
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
