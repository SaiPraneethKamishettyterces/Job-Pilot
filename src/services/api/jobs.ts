import { api } from "./client.js";

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

// Start a manual application for an existing matched job (dedups; links to the real job).
export async function applyToJob(jobId: string): Promise<{ applicationId: string; status: string }> {
  const { data } = await api.post<{ applicationId: string; status: string }>(`/api/jobs/${jobId}/apply`);
  return data;
}

// Read-only: existing application + generated docs for a job (to reuse, not re-generate).
export async function getJobApplication(jobId: string): Promise<{
  applicationId: string | null;
  status: string | null;
  documents: import("./applications").ApplicationDocument[];
}> {
  const { data } = await api.get(`/api/jobs/${jobId}/application`);
  return data;
}

// ─── Job Candidates (T2) ─────────────────────────────────────────────────────

export type JobCandidate = {
  id: string;
  runId: string | null;
  source: string | null;
  atsPlatform: string | null;
  title: string;
  company: string;
  department: string | null;
  location: string | null;
  remoteType: string | null;
  employmentType: string | null;
  seniority: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  visaSponsored: boolean | null;
  skills: string[];
  tools: string[];
  jobUrl: string | null;
  applyUrl: string | null;
  postedAt: string | null;
  ingestedAt: string | null;
};

export async function getJobCandidates(runId?: string): Promise<{ jobs: JobCandidate[]; total: number }> {
  const { data } = await api.get("/api/jobs/candidates", {
    params: runId ? { runId } : undefined,
  });
  return data;
}
