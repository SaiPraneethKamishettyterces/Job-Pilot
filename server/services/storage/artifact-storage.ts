import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { config } from "../../lib/config.js";
import { logger } from "../../lib/logger.js";

// Artifact storage for generated documents (tailored resumes, packages, etc.).
//
// Two backends, selected by config:
//   • GCS  — when config.storage.gcsBucket is set (production on Cloud Run, whose
//            local disk is ephemeral). Objects are private; downloads are always
//            served through the authenticated /api/files route, never a public URL.
//   • local fs — default for dev/test (and simple single-instance prod), under
//            <repo>/artifacts or STORAGE_DIR.
// The call sites and the returned `key`/`downloadPath` are identical for both.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = config.storage.dir || path.resolve(__dirname, "..", "..", "..", "artifacts");
const BUCKET = config.storage.gcsBucket; // "" when unset → local fs backend

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

// Lazily-created, cached GCS bucket handle. The dependency is imported via a
// variable specifier so the local/dev build never has to resolve it.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let bucketHandle: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function gcsBucket(): Promise<any> {
  if (!BUCKET) return null;
  if (bucketHandle) return bucketHandle;
  const specifier = "@google-cloud/storage";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = (await import(specifier)) as any;
  const storage = new mod.Storage(
    config.storage.gcpProject ? { projectId: config.storage.gcpProject } : {},
  );
  bucketHandle = storage.bucket(BUCKET);
  logger.info({ bucket: BUCKET }, "Artifact storage: using GCS backend");
  return bucketHandle;
}

/** Write bytes to the artifact store under `key`. Returns the stored ref. */
export async function putArtifact(key: string, data: Buffer | string): Promise<StoredArtifact> {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;

  if (BUCKET) {
    const bucket = await gcsBucket();
    await bucket.file(key).save(buf, {
      resumable: false,
      contentType: contentType(key),
      metadata: { cacheControl: "private, max-age=0" },
    });
    return { key, downloadPath: `/api/files/${key}`, bytes: buf.length };
  }

  const full = path.join(ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return { key, downloadPath: `/api/files/${key}`, bytes: buf.length };
}

/** Read bytes for a stored artifact key. Returns null if absent. */
export async function getArtifact(key: string): Promise<Buffer | null> {
  if (BUCKET) {
    const bucket = await gcsBucket();
    const file = bucket.file(key);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [buf] = await file.download();
    return buf as Buffer;
  }

  const full = path.join(ROOT, key);
  if (!existsSync(full)) return null;
  return readFile(full);
}

export const storageRoot = ROOT;
/** Which backend is active (for diagnostics / readiness). */
export const storageBackend: "gcs" | "local" = BUCKET ? "gcs" : "local";
