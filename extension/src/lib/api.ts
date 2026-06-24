// JobPilot API client for the extension. Reuses the EXISTING server endpoints:
//   GET  /api/applications/:id            → returns the ApplicationPackage
//   POST /api/applications/:id/answers    → QA with server-side guardrails
//   POST /api/applications/:id/mark-applied → record completion after user submits
//
// Auth: a bearer token the user obtains from the JobPilot web app (stored in
// chrome.storage). A dedicated extension-auth handshake endpoint is a Phase-B
// follow-up (see AUTOFILL_V2_PLAN.md); until then the token is configured once.

import type { WireApplicationPackage } from "../../../shared/autofill/package-types.js";

export interface ApiConfig {
  baseUrl: string; // e.g. https://app.jobpilot.example  (or http://localhost:3001)
  token: string; // JWT bearer
}

async function req<T>(cfg: ApiConfig, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${cfg.baseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cfg.token}`,
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`);
  return (await res.json()) as T;
}

export async function fetchPackage(cfg: ApiConfig, applicationId: string): Promise<WireApplicationPackage> {
  const data = await req<{ application: { applicationPackage: WireApplicationPackage | null } }>(
    cfg,
    `/api/applications/${applicationId}`,
  );
  const pkg = data.application?.applicationPackage;
  if (!pkg) throw new Error("No application package — generate documents in JobPilot first.");
  return pkg;
}

// Auto-detect: resolve the application for the page URL the user has open (finds an
// existing application or creates one from the URL), and return its autofill package
// — so the extension needs NO manually-pasted Application ID.
export async function resolveByUrl(
  cfg: ApiConfig,
  url: string,
): Promise<{ applicationId: string; created: boolean; package: WireApplicationPackage }> {
  return req(cfg, `/api/applications/resolve-by-url`, { method: "POST", body: JSON.stringify({ url }) });
}

export interface AnswerResult {
  answer: string | null;
  needsUserAction: boolean;
  isSensitive: boolean;
  confidence: number;
}

// Batch-answer questions. Server enforces never-fabricate + sensitive escalation.
export async function answerQuestions(
  cfg: ApiConfig,
  applicationId: string,
  questions: string[],
): Promise<Map<string, AnswerResult>> {
  if (!questions.length) return new Map();
  const data = await req<{ answers: Array<{ question: string } & AnswerResult> }>(
    cfg,
    `/api/applications/${applicationId}/answers`,
    { method: "POST", body: JSON.stringify({ questions }) },
  );
  const map = new Map<string, AnswerResult>();
  for (const a of data.answers) {
    map.set(a.question, {
      answer: a.answer ?? null,
      needsUserAction: a.needsUserAction ?? false,
      isSensitive: a.isSensitive ?? false,
      confidence: a.confidence ?? 0,
    });
  }
  return map;
}

export async function markApplied(cfg: ApiConfig, applicationId: string): Promise<void> {
  await req(cfg, `/api/applications/${applicationId}/mark-applied`, { method: "POST", body: "{}" });
}
