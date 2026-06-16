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

export async function answerApplicationQuestions(
  id: string,
  questions: string[],
): Promise<{ answers: Array<{ id: string; question: string; answer: string | null; needsUserAction: boolean; isSensitive: boolean; source: string }> }> {
  const { data } = await api.post(`/api/applications/${id}/answers`, { questions });
  return data;
}
