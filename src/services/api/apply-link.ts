import { api } from "./client.js";

// Paste-a-link (Part 1.7). Step 1 of the guided /apply-link flow: parse the pasted
// URL + create an application (no AI doc generation yet — that's a confirmed step
// via generateDocuments). Reuses generateDocuments / getApplication / submit /
// markApplied from ./applications.ts for the later steps.

export interface ApplyLinkAdapter {
  id: string;
  vendorLabel: string;
  capabilities: {
    autofillSupported: boolean;
    requiresLogin: boolean;
    multiStep: boolean;
    runner: "server" | "extension" | "either";
    canAutoSubmit: boolean;
  };
  guidance: string | null;
}

export interface ApplyLinkResult {
  applicationId: string;
  job: {
    title: string;
    company: string;
    location: string | null;
    isRemote: boolean | null;
    salaryMin: number | null;
    salaryMax: number | null;
    salaryCurrency: string | null;
    skills: string[];
    requirements: string[];
    atsPlatform: string | null;
  };
  adapter: ApplyLinkAdapter;
}

export async function createApplicationFromUrl(url: string): Promise<ApplyLinkResult> {
  const { data } = await api.post<ApplyLinkResult>("/api/applications/from-url", { url });
  return data;
}
