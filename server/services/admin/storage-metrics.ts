// Storage metrics (admin infra cost tracking). snapshotStorage() runs once/day and
// records exact Postgres on-disk sizes into StorageDailyMetric across several scopes:
//   database     — whole DB size (one row, key="_")
//   table        — per-table total/heap/index/toast bytes + estimated row count
//   source       — JobPosting bytes attributable to each source (description, clean,
//                  rawJson, embedding) → storage-weighted source ranking
//   artifactType — generated-document blob bytes by type (resume/cover_letter/…)
//   user         — generated-document blob bytes per user (top 200)
// Today everything lives in one Postgres + the in-DB Artifact blobs; these byte
// counts let the Storage tab project the cloud bill (Cloud SQL vs GCS) on migration.
import { prisma } from "../../lib/db.js";
import { logger } from "../../lib/logger.js";

/** UTC midnight bucket — matches StorageDailyMetric's per-day unique key. */
function dayBucket(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

type Row = {
  scope: string;
  key: string;
  bytesTotal: bigint;
  bytesHeap: bigint;
  bytesIndex: bigint;
  bytesToast: bigint;
  rowCount: bigint;
};

const b = (v: unknown): bigint => (typeof v === "bigint" ? v : BigInt(Math.round(Number(v ?? 0))));

/** Collect every storage row for today (read-only catalog + aggregate queries). */
async function collectRows(): Promise<Row[]> {
  const rows: Row[] = [];

  // Whole-database size.
  const db = await prisma.$queryRaw<{ bytes: bigint }[]>`
    SELECT pg_database_size(current_database())::bigint AS bytes`;
  rows.push({ scope: "database", key: "_", bytesTotal: b(db[0]?.bytes), bytesHeap: 0n, bytesIndex: 0n, bytesToast: 0n, rowCount: 0n });

  // Per-table sizes (public schema, ordinary tables).
  const tables = await prisma.$queryRaw<
    { table: string; total: bigint; heap: bigint; index: bigint; toast: bigint; rows: bigint }[]
  >`
    SELECT c.relname AS table,
      pg_total_relation_size(c.oid)::bigint AS total,
      pg_relation_size(c.oid)::bigint AS heap,
      pg_indexes_size(c.oid)::bigint AS index,
      COALESCE(pg_relation_size(c.reltoastrelid), 0)::bigint AS toast,
      GREATEST(c.reltuples, 0)::bigint AS rows
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY total DESC`;
  for (const t of tables) {
    rows.push({
      scope: "table", key: t.table,
      bytesTotal: b(t.total), bytesHeap: b(t.heap), bytesIndex: b(t.index), bytesToast: b(t.toast), rowCount: b(t.rows),
    });
  }

  // Per-source JobPosting footprint (the heavy text + embedding columns).
  const sources = await prisma.$queryRaw<{ key: string | null; rows: bigint; bytes: bigint }[]>`
    SELECT "sourceName" AS key,
      COUNT(*)::bigint AS rows,
      COALESCE(SUM(
        COALESCE(pg_column_size("description"), 0)
        + COALESCE(pg_column_size("descriptionClean"), 0)
        + COALESCE(pg_column_size("rawJson"), 0)
        + COALESCE(pg_column_size("embedding"), 0)
      ), 0)::bigint AS bytes
    FROM "JobPosting" GROUP BY "sourceName"`;
  for (const s of sources) {
    rows.push({ scope: "source", key: s.key ?? "(unknown)", bytesTotal: b(s.bytes), bytesHeap: 0n, bytesIndex: 0n, bytesToast: 0n, rowCount: b(s.rows) });
  }

  // Artifact blobs by type (filename without extension) and per user (top 200).
  const byType = await prisma.$queryRaw<{ key: string; rows: bigint; bytes: bigint }[]>`
    SELECT regexp_replace(regexp_replace("key", '^.*/', ''), '\.[^.]*$', '') AS key,
      COUNT(*)::bigint AS rows, COALESCE(SUM("size"), 0)::bigint AS bytes
    FROM "Artifact" GROUP BY 1 ORDER BY bytes DESC`;
  for (const a of byType) {
    rows.push({ scope: "artifactType", key: a.key || "(other)", bytesTotal: b(a.bytes), bytesHeap: 0n, bytesIndex: 0n, bytesToast: 0n, rowCount: b(a.rows) });
  }

  const byUser = await prisma.$queryRaw<{ key: string | null; rows: bigint; bytes: bigint }[]>`
    SELECT "userId" AS key, COUNT(*)::bigint AS rows, COALESCE(SUM("size"), 0)::bigint AS bytes
    FROM "Artifact" GROUP BY "userId" ORDER BY bytes DESC LIMIT 200`;
  for (const u of byUser) {
    rows.push({ scope: "user", key: u.key ?? "(none)", bytesTotal: b(u.bytes), bytesHeap: 0n, bytesIndex: 0n, bytesToast: 0n, rowCount: b(u.rows) });
  }

  return rows;
}

/**
 * Snapshot today's storage into StorageDailyMetric (idempotent per day via the
 * [date, scope, key] unique key — re-running overwrites today's numbers). Returns
 * the number of rows written. Never throws.
 */
export async function snapshotStorage(): Promise<number> {
  try {
    const date = dayBucket();
    const rows = await collectRows();
    for (const r of rows) {
      await prisma.storageDailyMetric
        .upsert({
          where: { date_scope_key: { date, scope: r.scope, key: r.key } },
          create: { date, ...r },
          update: { bytesTotal: r.bytesTotal, bytesHeap: r.bytesHeap, bytesIndex: r.bytesIndex, bytesToast: r.bytesToast, rowCount: r.rowCount },
        })
        .catch((err) => logger.warn({ scope: r.scope, key: r.key, err: String(err) }, "storage upsert failed"));
    }
    logger.info({ rows: rows.length }, "Storage snapshot recorded");
    return rows.length;
  } catch (err) {
    logger.error({ err: String(err) }, "snapshotStorage failed");
    return 0;
  }
}
