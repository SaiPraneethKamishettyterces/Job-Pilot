import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { env } from "../../lib/env.js";

// Artifact storage for generated documents (tailored resumes, packages, etc.).
//
// Ported from Job_applying_agent/storage/gcs_client.py but adapted to Job-Pilot's
// deployment: local disk by default (dev + simple prod), with a seam for GCS.
// When STORAGE_DIR is unset, artifacts live under <repo>/artifacts and are served
// through the authenticated /api/applications/:id/documents/:docId/download route
// (the download URL is relative, never a public bucket URL).
//
// To move to GCS later, implement put()/getBytes() against @google-cloud/storage
// keyed on env.GCS_BUCKET_NAME — the call sites and the returned `key` are stable.

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = env.STORAGE_DIR || path.resolve(__dirname, "..", "..", "..", "artifacts");

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

/** Write bytes to the artifact store under `key`. Returns the stored ref. */
export async function putArtifact(key: string, data: Buffer | string): Promise<StoredArtifact> {
  const buf = typeof data === "string" ? Buffer.from(data, "utf-8") : data;
  const full = path.join(ROOT, key);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, buf);
  return { key, downloadPath: `/api/files/${key}`, bytes: buf.length };
}

/** Read bytes for a stored artifact key. Returns null if absent. */
export async function getArtifact(key: string): Promise<Buffer | null> {
  const full = path.join(ROOT, key);
  if (!existsSync(full)) return null;
  return readFile(full);
}

export const storageRoot = ROOT;
