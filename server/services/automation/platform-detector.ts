// Detect which ATS an application URL belongs to. Deliberately simple substring
// matching (ported from Job_applying_agent/apply/platform_detector.py). Adding a
// new platform is a one-line change here plus a new field map + filler branch.

export type Platform = "greenhouse" | "lever" | "ashby" | "workable" | "unsupported";

// ATSs we can prepare an autofill package for (have a field map + filler branch).
const SUPPORTED: Array<{ platform: Platform; match: string }> = [
  // Covers greenhouse.io, boards.greenhouse.io, job-boards.greenhouse.io.
  { platform: "greenhouse", match: "greenhouse.io" },
  // Covers lever.co and jobs.lever.co.
  { platform: "lever", match: "lever.co" },
  // Covers jobs.ashbyhq.com / ashbyhq.com.
  { platform: "ashby", match: "ashbyhq.com" },
  // Covers apply.workable.com / <company>.workable.com.
  { platform: "workable", match: "workable.com" },
];

// ATSs we can RECOGNIZE (so we can give the user an accurate message) but do not
// yet auto-fill. Detecting these lets us say "Workday isn't auto-fillable yet"
// instead of a generic "unsupported domain". Keyed by a vendor display name.
const RECOGNIZED_UNSUPPORTED: Array<{ vendor: string; matches: string[] }> = [
  { vendor: "Workday", matches: ["myworkdayjobs.com", "workday.com", ".wd1.", ".wd3.", ".wd5."] },
  { vendor: "SmartRecruiters", matches: ["smartrecruiters.com"] },
  { vendor: "iCIMS", matches: ["icims.com"] },
  { vendor: "Jobvite", matches: ["jobvite.com"] },
  { vendor: "BambooHR", matches: ["bamboohr.com"] },
  { vendor: "Recruitee", matches: ["recruitee.com"] },
  { vendor: "Breezy", matches: ["breezy.hr"] },
  { vendor: "Taleo", matches: ["taleo.net"] },
  { vendor: "SuccessFactors", matches: ["successfactors.com", "sapsf.com"] },
  { vendor: "Teamtailor", matches: ["teamtailor.com"] },
  { vendor: "Workday/Greenhouse embed", matches: ["jobvite", "myworkday"] },
];

export function detectPlatform(url: string | null | undefined): Platform {
  if (!url) return "unsupported";
  const u = url.toLowerCase();
  for (const s of SUPPORTED) if (u.includes(s.match)) return s.platform;
  return "unsupported";
}

export interface AtsRecognition {
  platform: Platform;
  // Display name of the ATS vendor when known (even if not auto-fillable).
  vendor: string | null;
  // True when we can build a working autofill package for this platform.
  autofillSupported: boolean;
}

/**
 * Richer detection used for user-facing messaging. Returns the supported
 * platform when we can autofill, otherwise names the recognized vendor so the
 * UI can tell the user *why* autofill isn't available and to apply manually.
 */
export function recognizeAts(url: string | null | undefined): AtsRecognition {
  const platform = detectPlatform(url);
  if (platform !== "unsupported") {
    return { platform, vendor: VENDOR_LABEL[platform] ?? platform, autofillSupported: true };
  }
  if (url) {
    const u = url.toLowerCase();
    for (const r of RECOGNIZED_UNSUPPORTED) {
      if (r.matches.some((m) => u.includes(m))) {
        return { platform: "unsupported", vendor: r.vendor, autofillSupported: false };
      }
    }
  }
  return { platform: "unsupported", vendor: null, autofillSupported: false };
}

const VENDOR_LABEL: Partial<Record<Platform, string>> = {
  greenhouse: "Greenhouse",
  lever: "Lever",
  ashby: "Ashby",
  workable: "Workable",
};
