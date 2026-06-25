import type { Application } from "../../types/index.js";
import { api } from "./client.js";

export type ApplicationsResponse = {
  applications: Application[];
  total: number;
};

export type GetApplicationsParams = {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function getApplications(params?: GetApplicationsParams): Promise<ApplicationsResponse> {
  const { data } = await api.get<ApplicationsResponse>("/api/applications", { params });
  return data;
}

export async function updateApplication(
  id: string,
  updates: { status?: string; notes?: string; followUpDate?: string | null; hiringManagerEmail?: string }
): Promise<{ application: Application }> {
  const { data } = await api.patch(`/api/applications/${id}`, updates);
  return data;
}

export async function archiveApplication(id: string): Promise<void> {
  await api.delete(`/api/applications/${id}`);
}

// ─── Generated documents + lifecycle ─────────────────────────────────────────

export interface ApplicationDocument {
  id: string;
  type: "resume" | "cover_letter" | "qa_answers" | "cold_email" | "application_package";
  fileUrl: string | null;
  content: string | null;
  metadata: unknown;
  createdAt: string;
}

export interface StandardField {
  key: string;
  label: string;
  value: string | null;
  required: boolean;
  selectors: string[];
}

export interface ApplicationPackage {
  version: string;
  jobId: string;
  platform: string;
  applyUrl: string | null;
  standardFields: StandardField[];
  warnings: string[];
  resume: { filename: string | null; downloadUrl: string | null };
}

export interface ApplicationDetail extends Application {
  documents: ApplicationDocument[];
  answers: Array<{ id: string; question: string; answer: string; isSensitive: boolean; approved: boolean | null }>;
  events: Array<{ id: string; type: string; description: string | null; createdAt: string }>;
  applicationPackage: ApplicationPackage | null;
}

export async function getApplication(id: string): Promise<{ application: ApplicationDetail }> {
  const { data } = await api.get(`/api/applications/${id}`);
  return data;
}

// All generated documents across the user's applications (for the Documents view).
export interface GeneratedDocument {
  id: string;
  type: "resume" | "cover_letter" | "cold_email";
  content: string | null;
  createdAt: string;
  /** Downloadable file URLs (tailored resumes only). Served via the auth'd /api/files route. */
  pdfUrl: string | null;
  docxUrl: string | null;
  /** Model that generated this doc (e.g. "claude-sonnet-4-6", "qwen2.5:3b"). Resume only. */
  generatedBy: string | null;
  application: { id: string; company: string; roleTitle: string; status: string; jobUrl: string | null; scrapedAt?: string | null };
}

export async function getDocuments(): Promise<{ documents: GeneratedDocument[] }> {
  const { data } = await api.get<{ documents: GeneratedDocument[] }>("/api/applications/documents");
  return data;
}

/**
 * Download an artifact (PDF/DOCX) from the auth'd /api/files route and save it to
 * disk. A plain <a href> can't carry the Bearer token, so we fetch the bytes via
 * the authenticated axios client, then trigger a browser save from a blob URL.
 */
export async function downloadFile(url: string, filename: string): Promise<void> {
  const { data } = await api.get<Blob>(url, { responseType: "blob" });
  const objectUrl = URL.createObjectURL(data);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export async function generateDocuments(
  id: string,
): Promise<{ applicationId: string; status: string; usedAi: boolean; warnings: string[]; documentTypes: string[] }> {
  const { data } = await api.post(`/api/applications/${id}/generate`);
  return data;
}

export async function approveApplication(id: string): Promise<{ application: Application }> {
  const { data } = await api.post(`/api/applications/${id}/approve`);
  return data;
}

export async function declineApplication(id: string): Promise<{ application: Application }> {
  const { data } = await api.post(`/api/applications/${id}/decline`);
  return data;
}

export async function submitApplication(
  id: string,
): Promise<{ result: { status: string; reason: string; blocker?: string }; status: string }> {
  const { data } = await api.post(`/api/applications/${id}/submit`);
  return data;
}

export async function markApplied(id: string): Promise<{ application: Application }> {
  const { data } = await api.post(`/api/applications/${id}/mark-applied`);
  return data;
}

export async function retryApplication(
  id: string,
): Promise<{ retried: boolean; status?: string; reason: string; retryCount?: number }> {
  const { data } = await api.post(`/api/applications/${id}/retry`);
  return data;
}

export async function answerApplicationQuestions(
  id: string,
  questions: string[],
): Promise<{ answers: Array<{ id: string; question: string; answer: string | null; needsUserAction: boolean; isSensitive: boolean; source: string }> }> {
  const { data } = await api.post(`/api/applications/${id}/answers`, { questions });
  return data;
}
