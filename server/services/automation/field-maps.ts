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
    getter: (u) => u.location ?? u.city,
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

// Ashby — jobs.ashbyhq.com (React app; stable name attributes on its form fields).
const ASHBY_FIELDS: FieldSpec[] = [
  { key: "name", label: "Full name", required: true, getter: (u) => effectiveFullName(u),
    selectors: ["input[name='_systemfield_name']", "input[name='name']", "input[aria-label*='Name' i]"] },
  { key: "email", label: "Email", required: true, getter: (u) => u.email,
    selectors: ["input[name='_systemfield_email']", "input[type='email']", "input[name='email']"] },
  { key: "phone", label: "Phone", getter: (u) => u.phone,
    selectors: ["input[name='_systemfield_phone']", "input[type='tel']", "input[name='phone']"] },
  { key: "linkedin", label: "LinkedIn", getter: (u) => u.linkedinUrl,
    selectors: ["input[aria-label*='LinkedIn' i]", "input[name*='linkedin' i]"] },
  { key: "github", label: "GitHub", getter: (u) => u.githubUrl,
    selectors: ["input[aria-label*='GitHub' i]", "input[name*='github' i]"] },
];

// Workable — apply.workable.com / <company>.workable.com.
const WORKABLE_FIELDS: FieldSpec[] = [
  { key: "firstname", label: "First name", required: true, getter: (u) => u.firstName,
    selectors: ["input[name='firstname']", "#firstname", "input[aria-label*='First name' i]"] },
  { key: "lastname", label: "Last name", required: true, getter: (u) => u.lastName,
    selectors: ["input[name='lastname']", "#lastname", "input[aria-label*='Last name' i]"] },
  { key: "email", label: "Email", required: true, getter: (u) => u.email,
    selectors: ["input[name='email']", "input[type='email']", "#email"] },
  { key: "phone", label: "Phone", getter: (u) => u.phone,
    selectors: ["input[name='phone']", "input[type='tel']", "#phone"] },
  { key: "address", label: "Address", getter: (u) => u.addressLine1,
    selectors: ["input[name='address']", "input[aria-label*='Address' i]"] },
  { key: "linkedin", label: "LinkedIn", getter: (u) => u.linkedinUrl,
    selectors: ["input[name*='linkedin' i]", "input[aria-label*='LinkedIn' i]"] },
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

// Common fields most ATS forms ask for, with generic (attribute-contains)
// selectors. Appended to every platform map for keys the platform-specific map
// doesn't already define, so we prefill as much as the user's data allows.
// (The packager only emits a field when it has a value or is required, so adding
// these never bloats the package.) NOTE: no EEO/demographic fields here — policy.
const COMMON_FIELDS: FieldSpec[] = [
  { key: "address_line1", label: "Address", getter: (u) => u.addressLine1,
    selectors: ["input[name*='address' i]:not([name*='2' i])", "input[autocomplete='address-line1']", "input[aria-label*='Address' i]"] },
  { key: "address_line2", label: "Address line 2", getter: (u) => u.addressLine2,
    selectors: ["input[name*='address2' i]", "input[name*='address_2' i]", "input[autocomplete='address-line2']"] },
  { key: "city", label: "City", getter: (u) => u.city ?? u.location,
    selectors: ["input[name*='city' i]", "input[autocomplete='address-level2']", "input[aria-label*='City' i]"] },
  { key: "state", label: "State / Region", getter: (u) => u.state,
    selectors: ["input[name*='state' i]", "select[name*='state' i]", "input[autocomplete='address-level1']", "input[aria-label*='State' i]"] },
  { key: "zip", label: "Postal code", getter: (u) => u.zipCode,
    selectors: ["input[name*='zip' i]", "input[name*='postal' i]", "input[autocomplete='postal-code']"] },
  { key: "country", label: "Country", getter: (u) => u.country,
    selectors: ["input[name*='country' i]", "select[name*='country' i]", "input[autocomplete='country-name']"] },
  { key: "current_company", label: "Current company", getter: (u) => u.currentCompany,
    selectors: ["input[name*='company' i]", "input[name*='employer' i]", "input[aria-label*='Company' i]"] },
  { key: "current_title", label: "Current title", getter: (u) => u.currentTitle,
    selectors: ["input[name*='current_title' i]", "input[name*='position' i]", "input[aria-label*='Current title' i]"] },
  { key: "years_experience", label: "Years of experience", getter: (u) => (u.yearsOfExperience != null ? String(u.yearsOfExperience) : null),
    selectors: ["input[name*='experience' i]", "input[aria-label*='experience' i]"] },
  { key: "desired_salary", label: "Desired salary", getter: (u) => u.desiredSalary,
    selectors: ["input[name*='salary' i]", "input[name*='compensation' i]", "input[aria-label*='salary' i]"] },
  { key: "notice_period", label: "Notice period", getter: (u) => u.noticePeriod,
    selectors: ["input[name*='notice' i]", "input[aria-label*='notice' i]"] },
  { key: "start_date", label: "Availability / start date", getter: (u) => u.availabilityToStart,
    selectors: ["input[name*='availab' i]", "input[name*='start_date' i]", "input[aria-label*='start date' i]"] },
  { key: "school", label: "School", getter: (u) => u.schoolName,
    selectors: ["input[name*='school' i]", "input[name*='university' i]", "input[aria-label*='School' i]"] },
  { key: "degree", label: "Degree", getter: (u) => u.highestDegree,
    selectors: ["input[name*='degree' i]", "select[name*='degree' i]", "input[aria-label*='Degree' i]"] },
  { key: "major", label: "Field of study", getter: (u) => u.major,
    selectors: ["input[name*='major' i]", "input[name*='discipline' i]", "input[aria-label*='Field of study' i]"] },
  { key: "graduation_year", label: "Graduation year", getter: (u) => u.graduationYear,
    selectors: ["input[name*='graduat' i]", "input[aria-label*='Graduation' i]"] },
  { key: "github", label: "GitHub", getter: (u) => u.githubUrl,
    selectors: ["input[name*='github' i]", "input[aria-label*='GitHub' i]"] },
  { key: "portfolio", label: "Portfolio", getter: (u) => u.portfolioUrl,
    selectors: ["input[name*='portfolio' i]", "input[aria-label*='Portfolio' i]"] },
  { key: "website", label: "Website", getter: (u) => u.websiteUrl,
    selectors: ["input[name*='website' i]", "input[aria-label*='Website' i]"] },
];

// Append common fields for any key a platform map doesn't already cover. The
// platform-specific spec (more precise selectors) always wins on key collision.
function withCommon(specific: FieldSpec[]): FieldSpec[] {
  const keys = new Set(specific.map((f) => f.key));
  return [...specific, ...COMMON_FIELDS.filter((f) => !keys.has(f.key))];
}

// Fallback for recognized-but-unsupported portals (Workday, iCIMS, …): there are
// no reliable selectors to autofill, but we still surface every value the user
// has so they can copy it into the portal — turning a manual apply into mostly
// copy/paste. Identity fields the platform maps cover are prepended here.
export const COMMON_FIELDS_FALLBACK: FieldSpec[] = [
  { key: "full_name", label: "Full name", getter: (u) => effectiveFullName(u), selectors: [] },
  { key: "email", label: "Email", getter: (u) => u.email, selectors: [] },
  { key: "phone", label: "Phone", getter: (u) => u.phone, selectors: [] },
  { key: "linkedin", label: "LinkedIn", getter: (u) => u.linkedinUrl, selectors: [] },
  ...COMMON_FIELDS.map((f) => ({ ...f, selectors: [] })),
];

export const FIELD_MAPS: Partial<Record<Platform, FieldSpec[]>> = {
  greenhouse: withCommon(GREENHOUSE_FIELDS),
  lever: withCommon(LEVER_FIELDS),
  ashby: withCommon(ASHBY_FIELDS),
  workable: withCommon(WORKABLE_FIELDS),
};

// Per-platform CAPTCHA note surfaced to the user (they solve it before submit).
export const CAPTCHA_NOTE: Partial<Record<Platform, string>> = {
  greenhouse: "Greenhouse forms use reCAPTCHA — solve it (if shown) before submitting.",
  lever: "Lever forms use hCaptcha — solve it before submitting.",
  ashby: "Ashby may show a verification challenge — complete it before submitting.",
  workable: "Workable may show a CAPTCHA — solve it before submitting.",
};
