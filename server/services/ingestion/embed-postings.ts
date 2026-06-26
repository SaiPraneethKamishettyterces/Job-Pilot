// Batch-embed global JobPosting rows. Pulls postings whose embedding is missing
// or stale (embeddedAt = null), embeds title + skills + description via the
// existing compatEmbed provider, and writes vectors through raw SQL. Reused by
// the global ingestor and by the one-off migration backfill.
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { compatEmbed, hasCompat } from "../ai/ai-service.js";
import { findUnembedded, writeEmbedding } from "../../repositories/job-posting-repository.js";
import { estimateEmbedCostUsd } from "./cost-math.js";

const EMBED_BATCH = 50; // texts per embeddings request
const MAX_TEXT_CHARS = 3000; // keep request payloads small

/** Build the text we embed for a posting (title carries the most matching signal). */
function postingText(p: { title: string; descriptionClean: string | null; skillsJson: unknown }): string {
  const skills = Array.isArray(p.skillsJson) ? (p.skillsJson as string[]).join(", ") : "";
  return [p.title, skills && `Skills: ${skills}`, p.descriptionClean ?? ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, MAX_TEXT_CHARS);
}

/** Estimated USD cost to embed `text` at the configured per-million-token rate. */
function embedCostFor(text: string): number {
  return estimateEmbedCostUsd(text.length, config.ai.embedUsdPerMillionTokens);
}

export type EmbedResult = { embedded: number; costUsd: number };

/**
 * Embed up to `max` pending postings. Returns the count embedded and the total
 * embedding cost (also stamped per-row as JobPosting.embedCostUsd). No-op when the
 * embedding provider isn't configured. Cost is $0 on a free-tier embed provider
 * (config.ai.embedUsdPerMillionTokens = 0) but the mechanism is always live.
 */
export async function embedPendingPostings(max = 1000): Promise<EmbedResult> {
  if (!hasCompat()) {
    logger.warn("embedPendingPostings: AI provider not configured (AI_COMPAT_API_KEY) — skipping embeddings");
    return { embedded: 0, costUsd: 0 };
  }
  const pending = await findUnembedded(max);
  if (!pending.length) return { embedded: 0, costUsd: 0 };

  let embedded = 0;
  let costUsd = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    const texts = batch.map(postingText);
    try {
      const vectors = await compatEmbed(texts);
      await Promise.all(
        batch.map((p, j) => {
          const vec = vectors[j];
          if (!vec?.length) return Promise.resolve();
          const cost = embedCostFor(texts[j]!);
          costUsd += cost;
          return writeEmbedding(p.id, vec, config.ai.embedModel, cost).then(() => {
            embedded++;
          });
        }),
      );
    } catch (err) {
      logger.warn({ err: String(err), batchStart: i }, "embedPendingPostings: batch failed");
    }
  }
  logger.info({ embedded, pending: pending.length, costUsd }, "embedPendingPostings: done");
  return { embedded, costUsd: Number(costUsd.toFixed(6)) };
}
