// Batch-embed global JobPosting rows. Pulls postings whose embedding is missing
// or stale (embeddedAt = null), embeds title + skills + description via the
// existing compatEmbed provider, and writes vectors through raw SQL. Reused by
// the global ingestor and by the one-off migration backfill.
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";
import { compatEmbed, hasCompat } from "../ai/ai-service.js";
import { findUnembedded, writeEmbedding } from "../../repositories/job-posting-repository.js";

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

/**
 * Embed up to `max` pending postings. Returns the number embedded. No-op (0) when
 * the embedding provider isn't configured.
 */
export async function embedPendingPostings(max = 1000): Promise<number> {
  if (!hasCompat()) {
    logger.warn("embedPendingPostings: AI provider not configured (AI_COMPAT_API_KEY) — skipping embeddings");
    return 0;
  }
  const pending = await findUnembedded(max);
  if (!pending.length) return 0;

  let embedded = 0;
  for (let i = 0; i < pending.length; i += EMBED_BATCH) {
    const batch = pending.slice(i, i + EMBED_BATCH);
    try {
      const vectors = await compatEmbed(batch.map(postingText));
      await Promise.all(
        batch.map((p, j) => {
          const vec = vectors[j];
          if (!vec?.length) return Promise.resolve();
          return writeEmbedding(p.id, vec, config.ai.embedModel).then(() => {
            embedded++;
          });
        }),
      );
    } catch (err) {
      logger.warn({ err: String(err), batchStart: i }, "embedPendingPostings: batch failed");
    }
  }
  logger.info({ embedded, pending: pending.length }, "embedPendingPostings: done");
  return embedded;
}
