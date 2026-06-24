// Jobicy — free public remote-jobs API. No auth.
// https://jobicy.com/api/v2/remote-jobs  (documented public API; attribution requested)
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type JobicyJob = {
  id?: number | string;
  url?: string;
  jobTitle?: string;
  companyName?: string;
  companyLogo?: string;
  jobIndustry?: string | string[];
  jobType?: string | string[];
  jobGeo?: string;
  jobLevel?: string;
  jobExcerpt?: string;
  jobDescription?: string; // HTML
  pubDate?: string; // ISO-ish
};

export async function fetchJobicy(): Promise<RawJob[]> {
  const data = await getJson<{ jobs?: JobicyJob[] }>("https://jobicy.com/api/v2/remote-jobs?count=50");
  if (!data?.jobs?.length) return [];
  return data.jobs.map((j) => {
    const body = j.jobDescription || j.jobExcerpt || "";
    const type = Array.isArray(j.jobType) ? j.jobType[0] : j.jobType;
    return {
      source: "jobicy",
      atsPlatform: "jobicy",
      sourceJobId: String(j.id ?? j.url ?? j.jobTitle ?? "unknown"),
      title: j.jobTitle?.trim() ?? "Untitled",
      company: j.companyName?.trim() ?? "Unknown",
      locationRaw: j.jobGeo ?? "Remote",
      department: Array.isArray(j.jobIndustry) ? (j.jobIndustry[0] ?? null) : (j.jobIndustry ?? null),
      descriptionText: body ? stripHtml(body) : "",
      jobUrl: j.url ?? null,
      applyUrl: j.url ?? null,
      postedAt: j.pubDate ?? null,
      workplaceType: "remote",
      commitment: type ?? null,
      raw: j,
    };
  });
}
