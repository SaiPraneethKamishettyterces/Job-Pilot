// Himalayas — free public remote-jobs API. No auth.
// https://himalayas.app/jobs/api  (documented public API)
import { getJson, stripHtml, type RawJob } from "../ats-sources.js";

type HimalayasJob = {
  guid?: string | number;
  title?: string;
  companyName?: string;
  excerpt?: string;
  description?: string; // HTML
  pubDate?: number | string; // epoch seconds or ISO
  applicationLink?: string;
  locationRestrictions?: string[];
  categories?: string[];
  employmentType?: string;
};

function toIso(pub: number | string | undefined): string | null {
  if (pub == null) return null;
  if (typeof pub === "number") return new Date(pub * 1000).toISOString();
  const t = Date.parse(pub);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export async function fetchHimalayas(): Promise<RawJob[]> {
  const data = await getJson<{ jobs?: HimalayasJob[] }>("https://himalayas.app/jobs/api?limit=100");
  if (!data?.jobs?.length) return [];
  return data.jobs.map((j) => ({
    source: "himalayas",
    atsPlatform: "himalayas",
    sourceJobId: String(j.guid ?? j.applicationLink ?? j.title ?? "unknown"),
    title: j.title?.trim() ?? "Untitled",
    company: j.companyName?.trim() ?? "Unknown",
    locationRaw: j.locationRestrictions?.length ? j.locationRestrictions.join(", ") : "Remote",
    department: j.categories?.[0] ?? null,
    descriptionText: (j.description || j.excerpt) ? stripHtml(j.description || j.excerpt!) : "",
    jobUrl: j.applicationLink ?? null,
    applyUrl: j.applicationLink ?? null,
    postedAt: toIso(j.pubDate),
    workplaceType: "remote",
    commitment: j.employmentType ?? null,
    raw: j,
  }));
}
