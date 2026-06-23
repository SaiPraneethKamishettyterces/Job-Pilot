// Detect the ATS platform + board token from a careers / job-board URL. Used to
// import lists that only give URLs (e.g. OpenJobs `ats_links`) and to auto-grow the
// registry from user-pasted company URLs. Returns null when no known ATS matches.
import type { RegistryEntry } from "./registry.js";
import type { AtsType } from "./ats-sources.js";

export function detectAtsFromUrl(rawUrl: string): RegistryEntry | null {
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase().replace(/^www\./, "");
  const segs = u.pathname.split("/").filter(Boolean);

  const mk = (ats: AtsType, token: string, extra?: Partial<RegistryEntry>): RegistryEntry | null =>
    token ? { ats, token, ...extra } : null;

  // Greenhouse: boards.greenhouse.io/{token}, job-boards.greenhouse.io/{token},
  // boards-api.greenhouse.io/v1/boards/{token}/...
  if (host.endsWith("greenhouse.io")) {
    const token = segs[0] === "v1" ? segs[2] : segs[0];
    return mk("greenhouse", token ?? "");
  }
  // Lever: jobs.lever.co/{token}, api.lever.co/v0/postings/{token}
  if (host.endsWith("lever.co")) {
    const token = segs[0] === "v0" ? segs[2] : segs[0];
    return mk("lever", token ?? "");
  }
  // Ashby: jobs.ashbyhq.com/{token}, api.ashbyhq.com/posting-api/job-board/{token}
  if (host.endsWith("ashbyhq.com")) {
    const token = host.startsWith("api.") ? segs[segs.length - 1] : segs[0];
    return mk("ashby", token ?? "");
  }
  // Workable: {token}.workable.com, apply.workable.com/{token}, .../accounts/{token}
  if (host.endsWith("workable.com")) {
    if (host !== "apply.workable.com" && host !== "workable.com") return mk("workable", host.split(".")[0]!);
    const idx = segs.indexOf("accounts");
    return mk("workable", idx >= 0 ? (segs[idx + 1] ?? "") : (segs[0] ?? ""));
  }
  // Recruitee: {token}.recruitee.com
  if (host.endsWith("recruitee.com") && host !== "recruitee.com") {
    return mk("recruitee", host.split(".")[0]!);
  }
  // Personio: {token}.jobs.personio.de / .com
  if (host.includes(".jobs.personio.")) {
    return mk("personio", host.split(".")[0]!);
  }
  // SmartRecruiters: careers/jobs.smartrecruiters.com/{token}, api.../companies/{token}
  if (host.endsWith("smartrecruiters.com")) {
    const idx = segs.indexOf("companies");
    return mk("smartrecruiters", idx >= 0 ? (segs[idx + 1] ?? "") : (segs[0] ?? ""));
  }
  // Workday: {tenant}.{dc}.myworkdayjobs.com/{site}  (also /wday/cxs/{tenant}/{site})
  if (host.endsWith("myworkdayjobs.com")) {
    const tenant = host.split(".")[0]!;
    const cxs = segs.indexOf("cxs");
    const site = cxs >= 0 ? segs[cxs + 2] : segs.find((s) => !/^[a-z]{2}-[A-Z]{2}$/.test(s)); // skip locale seg
    if (!tenant || !site) return null;
    return { ats: "workday", token: tenant, host, tenant, site };
  }
  return null;
}
