import type { Platform } from "./platform-detector.js";
import { effectiveFullName, type CandidateProfile } from "../profile/candidate-profile.js";

// Declarative per-platform field maps (ported from Job_applying_agent/apply/field_maps.py).
//
// Each FieldSpec says: the logical field, how to pull its value from the profile,
// the selectors the autofiller/extension should try (priority order), and whether
// it's required. The packager uses these to build the prefill package; the
// Playwright form-filler uses the same selectors to autofill the live form.
//
// >>> ADD A NEW PLATFORM HERE <<< add a FieldSpec[] + register in FIELD_MAPS,
// plus a branch in platform-detector.ts. No browser code needed for prefill.

export interface FieldSpec {
  key: string;
  label: string;
  getter: (p: CandidateProfile) => string | null;
  selectors: string[];
  required?: boolean;
}

// Greenhouse — classic boards + new job-boards React UI. Selectors cover both
// the classic field names and the new UI's ids.
const GREENHOUSE_FIELDS: FieldSpec[] = [
  {
    key: "first_name", label: "First name", required: true,
    getter: (u) => u.firstName,
    selectors: ["#first_name", "input[name='first_name']", "input[name='job_application[first_name]']", "input[autocomplete='given-name']"],
  },
  {
    key: "last_name", label: "Last name", required: true,
    getter: (u) => u.lastName,
    selectors: ["#last_name", "input[name='last_name']", "input[name='job_application[last_name]']", "input[autocomplete='family-name']"],
  },
  {
    key: "email", label: "Email", required: true,
    getter: (u) => u.email,
    selectors: ["#email", "input[type='email']", "input[name='email']", "input[name='job_application[email]']"],
  },
  {
    key: "phone", label: "Phone", required: true,
    getter: (u) => u.phone,
    selectors: ["#phone", "input[type='tel']", "input[name='phone']", "input[name='job_application[phone]']"],
  },
  {
    key: "location", label: "Location (City)",
    getter: (u) => u.location,
    selectors: ["#candidate-location", "#location", "input[name='location']", "input[autocomplete='address-level2']"],
  },
  {
    key: "linkedin", label: "LinkedIn",
    getter: (u) => u.linkedinUrl,
    selectors: ["input[aria-label*='LinkedIn' i]", "input[name*='linkedin' i]"],
  },
  {
    key: "website", label: "Website / Portfolio",
    getter: (u) => u.portfolioUrl ?? u.websiteUrl,
    selectors: ["input[aria-label*='Website' i]", "input[name*='website' i]", "input[aria-label*='Portfolio' i]"],
  },
];

// Lever — jobs.lever.co/.../apply.
const LEVER_FIELDS: FieldSpec[] = [
  {
    key: "name", label: "Full name", required: true,
    getter: (u) => effectiveFullName(u),
    selectors: ["input[name='name']"],
  },
  {
    key: "email", label: "Email", required: true,
    getter: (u) => u.email,
    selectors: ["input[name='email']", "input[type='email']"],
  },
  {
    key: "phone", label: "Phone",
    getter: (u) => u.phone,
    selectors: ["input[name='phone']", "input[type='tel']"],
  },
  {
    key: "org", label: "Current company",
    getter: (u) => u.currentCompany,
    selectors: ["input[name='org']"],
  },
  {
    key: "linkedin", label: "LinkedIn",
    getter: (u) => u.linkedinUrl,
    selectors: ["input[name='urls[LinkedIn]']", "input[name='urls[Linkedin]']"],
  },
  {
    key: "github", label: "GitHub",
    getter: (u) => u.githubUrl,
    selectors: ["input[name='urls[GitHub]']", "input[name='urls[Github]']"],
  },
  {
    key: "portfolio", label: "Portfolio / Other",
    getter: (u) => u.portfolioUrl ?? u.websiteUrl,
    selectors: ["input[name='urls[Portfolio]']", "input[name='urls[Other]']"],
  },
];

export const FIELD_MAPS: Partial<Record<Platform, FieldSpec[]>> = {
  greenhouse: GREENHOUSE_FIELDS,
  lever: LEVER_FIELDS,
};

// Per-platform CAPTCHA note surfaced to the user (they solve it before submit).
export const CAPTCHA_NOTE: Partial<Record<Platform, string>> = {
  greenhouse: "Greenhouse forms use reCAPTCHA — solve it (if shown) before submitting.",
  lever: "Lever forms use hCaptcha — solve it before submitting.",
};
