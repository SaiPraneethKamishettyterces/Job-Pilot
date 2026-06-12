import axios from "axios";
import type { ApplyRequest, TokenSummary, UserProfile, UserPreference } from "../types/index.js";

const TOKEN_KEY = "jp_token";
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export const api = axios.create({ baseURL: BASE });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ─── Legacy streaming (keep for existing claude streaming feature) ─────────────

export async function estimateTokens(req: ApplyRequest): Promise<number> {
  const { data } = await api.post<{ inputTokens: number }>("/api/claude/count-tokens", {
    system: "You are an expert job-application coach.",
    messages: [{ role: "user", content: req.jobDescription }],
  });
  return data.inputTokens;
}

export function streamApplication(
  req: ApplyRequest,
  onText: (chunk: string) => void,
  onDone: (usage: TokenSummary) => void,
  onError: (msg: string) => void
): AbortController {
  const controller = new AbortController();

  fetch(`${BASE}/api/claude/apply`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem(TOKEN_KEY) ?? ""}`,
    },
    body: JSON.stringify(req),
    signal: controller.signal,
  })
    .then(async (res) => {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const payload = JSON.parse(line.slice(6));
          if (payload.text) onText(payload.text);
          if (payload.done) onDone(payload.usage as TokenSummary);
          if (payload.error) onError(payload.error);
        }
      }
    })
    .catch((err) => {
      if (err.name !== "AbortError") onError(String(err));
    });

  return controller;
}

// ─── Profile API ──────────────────────────────────────────────────────────────

export type ProfileResponse = {
  profile: UserProfile | null;
  preferences: UserPreference | null;
};

export async function getProfile(): Promise<ProfileResponse> {
  const { data } = await api.get<ProfileResponse>("/api/profile");
  return data;
}

export async function updateProfile(profile: Partial<UserProfile>): Promise<{ profile: UserProfile }> {
  const { data } = await api.put<{ profile: UserProfile }>("/api/profile", profile);
  return data;
}

export async function updatePreferences(
  prefs: Partial<UserPreference>
): Promise<{ preferences: UserPreference }> {
  const { data } = await api.put<{ preferences: UserPreference }>("/api/profile/preferences", prefs);
  return data;
}

// ─── Jobs API ─────────────────────────────────────────────────────────────────

export type AddJobInput = {
  jobUrl?: string;
  rawText?: string;
};

export type JobWithMatch = {
  matchId: string;
  score: number;
  decision: "SHORTLIST" | "REVIEW" | "SKIP";
  reasons: string[];
  risks: string[];
  matchedAt: string;
  job: {
    id: string;
    title: string;
    company: string;
    location: string | null;
    isRemote: boolean | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    atsPlatform: string | null;
    jobUrl: string | null;
    skills: string[];
    requirements: string[];
    experienceMin: number | null;
    experienceMax: number | null;
    postedAt: string | null;
  };
};

export type JobsResponse = {
  jobs: JobWithMatch[];
  total: number;
};

export async function addJob(input: AddJobInput): Promise<{ job: unknown; match: unknown }> {
  const { data } = await api.post("/api/jobs", input);
  return data;
}

export async function getJobs(decision?: "SHORTLIST" | "REVIEW" | "SKIP"): Promise<JobsResponse> {
  const { data } = await api.get<JobsResponse>("/api/jobs", {
    params: decision ? { decision } : undefined,
  });
  return data;
}

export async function rescoreJob(jobId: string) {
  const { data } = await api.post(`/api/jobs/${jobId}/rescore`);
  return data as { score: number; decision: string; reasons: string[]; risks: string[] };
}

export async function removeJob(jobId: string): Promise<void> {
  await api.delete(`/api/jobs/${jobId}`);
}
