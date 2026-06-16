// Detect which ATS an application URL belongs to. Deliberately simple substring
// matching (ported from Job_applying_agent/apply/platform_detector.py). Adding a
// new platform is a one-line change here plus a new field map + filler branch.

export type Platform = "greenhouse" | "lever" | "ashby" | "workable" | "unsupported";

export function detectPlatform(url: string | null | undefined): Platform {
  if (!url) return "unsupported";
  const u = url.toLowerCase();
  // Covers greenhouse.io, boards.greenhouse.io, job-boards.greenhouse.io.
  if (u.includes("greenhouse.io")) return "greenhouse";
  // Covers lever.co and jobs.lever.co.
  if (u.includes("lever.co")) return "lever";
  // Covers jobs.ashbyhq.com / ashbyhq.com.
  if (u.includes("ashbyhq.com")) return "ashby";
  // Covers apply.workable.com / <company>.workable.com.
  if (u.includes("workable.com")) return "workable";
  return "unsupported";
}
