// RemoteOK — free public remote-jobs API. No auth.
// https://remoteok.com/api  (first array element is a legal/metadata notice)
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type RemoteOkJob = {
  id?: string | number;
  slug?: string;
  company?: string;
  position?: string;
  location?: string;
  tags?: string[];
  description?: string; // HTML
  date?: string;
  url?: string;
  apply_url?: string;
  salary_min?: number;
  salary_max?: number;
  // The metadata notice element has `legal` instead of job fields.
  legal?: string;
};

export async function fetchRemoteOk(): Promise<RawJob[]> {
  const data = await getJson<RemoteOkJob[]>("https://remoteok.com/api");
  if (!Array.isArray(data)) return [];
  return data
    .filter((j) => !j.legal && (j.position || j.slug))
    .map((j) => ({
      source: "remoteok",
      atsPlatform: "remoteok",
      sourceJobId: String(j.id ?? j.slug),
      title: j.position?.trim() ?? "Untitled",
      company: j.company?.trim() ?? "Unknown",
      locationRaw: j.location || "Remote",
      department: null,
      descriptionText: j.description ? stripHtml(j.description) : "",
      jobUrl: j.url ?? null,
      applyUrl: j.apply_url ?? j.url ?? null,
      postedAt: j.date ?? null,
      workplaceType: "remote",
      commitment: null,
      raw: j,
    }));
}
