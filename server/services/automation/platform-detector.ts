// Detect which ATS an application URL belongs to. Deliberately simple substring
// matching (ported from Job_applying_agent/apply/platform_detector.py). Adding a
// new platform is a one-line change here plus a new field map + filler branch.

export type Platform =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  // Phase A (1.7a) — public, no-login boards (server-side autofill OK).
  | "smartrecruiters"
  | "recruitee"
  | "breezy"
  | "teamtailor"
  | "jobvite"
  | "unsupported";

// ATSs we can prepare an autofill package for (have a field map + filler branch).
// NOTE: login-gated portals (Workday, iCIMS, …) are deliberately NOT here — they
// stay "unsupported" server-side because headless automation can't pass their
// auth wall; the browser extension (1.7b) handles them. See docs/AUTOFILL_V2_PLAN.md.
const SUPPORTED: Array<{ platform: Platform; match: string }> = [
  // Covers greenhouse.io, boards.greenhouse.io, job-boards.greenhouse.io.
  { platform: "greenhouse", match: "greenhouse.io" },
  // Covers lever.co and jobs.lever.co.
  { platform: "lever", match: "lever.co" },
  // Covers jobs.ashbyhq.com / ashbyhq.com.
  { platform: "ashby", match: "ashbyhq.com" },
  // Covers apply.workable.com / <company>.workable.com.
  { platform: "workable", match: "workable.com" },
  // Phase A — public no-login boards.
  { platform: "smartrecruiters", match: "smartrecruiters.com" },
  { platform: "recruitee", match: "recruitee.com" },
  { platform: "breezy", match: "breezy.hr" },
  { platform: "teamtailor", match: "teamtailor.com" },
  { platform: "jobvite", match: "jobvite.com" },
];

// ATSs we can RECOGNIZE (so we can give the user an accurate message) but do not
// yet auto-fill. Detecting these lets us say "Workday isn't auto-fillable yet"
// instead of a generic "unsupported domain". Keyed by a vendor display name.
// Login-gated / not-yet-fillable portals we still RECOGNIZE so we can message the
// user accurately. (SmartRecruiters/Recruitee/Breezy/Teamtailor/Jobvite moved to
// SUPPORTED in Phase A.) These remain extension-only (1.7b) or copy/paste-only.
const RECOGNIZED_UNSUPPORTED: Array<{ vendor: string; matches: string[] }> = [
  { vendor: "Workday", matches: ["myworkdayjobs.com", "workday.com", ".wd1.", ".wd3.", ".wd5."] },
  { vendor: "iCIMS", matches: ["icims.com"] },
  { vendor: "BambooHR", matches: ["bamboohr.com"] },
  { vendor: "Taleo", matches: ["taleo.net"] },
  { vendor: "SuccessFactors", matches: ["successfactors.com", "sapsf.com"] },
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
  smartrecruiters: "SmartRecruiters",
  recruitee: "Recruitee",
  breezy: "Breezy",
  teamtailor: "Teamtailor",
  jobvite: "Jobvite",
};

// Short, vendor-specific "how to apply" guidance for recognized-but-unsupported
// portals, so the manual handoff is as low-effort as possible. Keyed by the
// vendor name returned by recognizeAts(). Falls back to a generic tip.
const VENDOR_GUIDANCE: Record<string, string> = {
  Workday:
    "Workday needs an account: click Apply → 'Create Account' (or Sign In), then use 'Autofill with Resume' and paste from the details below. Workday carries data between its job sites, so you only set this up once per company.",
  iCIMS:
    "iCIMS usually lets you 'Apply with LinkedIn' or upload your resume to prefill — do that first, then fill the rest from the details below.",
  SmartRecruiters:
    "SmartRecruiters supports resume upload to prefill and social sign-in — use those, then complete remaining fields from the details below.",
  Jobvite: "Upload your resume to prefill where possible, then complete the form from the details below.",
  BambooHR: "Short form — fill it from the details below; attach your tailored resume.",
  Recruitee: "Upload your resume to prefill, then complete remaining fields from the details below.",
  Breezy: "Upload your resume to prefill, then complete remaining fields from the details below.",
  Taleo:
    "Taleo requires creating an account. Sign up, use resume upload to prefill, then complete the form from the details below.",
  SuccessFactors:
    "SAP SuccessFactors requires an account. Register, upload your resume to prefill, then complete the rest from the details below.",
  Teamtailor: "Upload your resume to prefill, then complete remaining fields from the details below.",
};

/** Vendor-specific manual-apply guidance for a recognized portal (or a generic tip). */
export function vendorGuidance(vendor: string | null): string {
  if (vendor && VENDOR_GUIDANCE[vendor]) return VENDOR_GUIDANCE[vendor]!;
  return "Open the application link, sign in or create an account if required, attach your tailored resume, and fill the form using the prepared details below.";
}
