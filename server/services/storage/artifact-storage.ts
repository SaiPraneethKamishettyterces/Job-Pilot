import { prisma } from "../../lib/db.js";

// Artifact storage for generated documents (tailored resumes, packages, etc.).
//
// Single backend: PostgreSQL — the same database the rest of the app uses. Bytes
// live in the Artifact table's BYTEA column, so generated files survive container
// restarts/redeploys with no external object store (no GCS bucket, no ephemeral-
// disk problem) and the local/dev story is just one Postgres.
//
// Downloads are always served through the authenticated /api/files route; the
// returned `key`/`downloadPath` shape is unchanged from the previous GCS/local-fs
// backends, so call sites did not change.

export interface StoredArtifact {
  /** Stable storage key, e.g. "applications/<userId>/<jobId>/resume.docx". */
  key: string;
  /** Relative download path the UI/extension can fetch (via an auth'd route). */
  downloadPath: string;
  bytes: number;
}

export function buildKey(userId: string, jobId: string, ...parts: string[]): string {
  return ["applications", userId, jobId, ...parts].join("/");
}

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".json": "application/json",
  ".txt": "text/plain",
};
function contentType(key: string): string {
  const lower = key.toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_BY_EXT)) if (lower.endsWith(ext)) return mime;
  return "application/octet-stream";
}

// Ownership (for cleanup/diagnostics) is derived from the key layout
// applications/<userId>/<...>; null when the key isn't in that form.
function userIdFromKey(key: string): string | null {
  const parts = key.split("/");
  return parts[0] === "applications" && parts[1] ? parts[1] : null;
}

/** Write bytes to the artifact store under `key`. Returns the stored ref. */
export async function putArtifact(key: string, data: Buffer | string): Promise<StoredArtifact> {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  // Prisma's Bytes maps to Uint8Array<ArrayBuffer>; copy Node's Buffer into one.
  const bytes = new Uint8Array(buf);
  const fields = { mimeType: contentType(key), data: bytes, size: bytes.length };
  await prisma.artifact.upsert({
    where: { key },
    create: { key, userId: userIdFromKey(key), ...fields },
    update: fields,
  });
  return { key, downloadPath: `/api/files/${key}`, bytes: buf.length };
}

/** Read bytes for a stored artifact key. Returns null if absent. */
export async function getArtifact(key: string): Promise<Buffer | null> {
  const row = await prisma.artifact.findUnique({ where: { key }, select: { data: true } });
  if (!row) return null;
  return Buffer.from(row.data);
}

/** Which backend is active (for diagnostics / readiness). */
export const storageBackend = "postgres" as const;
