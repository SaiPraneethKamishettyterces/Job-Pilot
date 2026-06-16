import { detectPlatform, recognizeAts, type Platform } from "../automation/platform-detector.js";
import { FIELD_MAPS, CAPTCHA_NOTE } from "../automation/field-maps.js";
import { effectiveFullName, EEO_KEYS, type CandidateProfile } from "../profile/candidate-profile.js";

// Build an ApplicationPackage — the contract between the engine and the browser
// extension (ported from Job_applying_agent/prepare/application_packager.py +
// models/application_package.py). Pure/data-only and fully testable: no network,
// no browser. The extension reads `standard_fields` to autofill the live form and
// fetches the resume from `resume.downloadUrl`.

export const PACKAGE_VERSION = "1";

export interface StandardField {
  key: string;
  label: string;
  value: string | null;
  required: boolean;
  selectors: string[];
}

export interface ResumeRef {
  filename: string | null;
  storageKey: string | null;
  downloadUrl: string | null;
  mimeType: string | null;
  note: string;
}

export interface ApplicationPackage {
  version: string;
  jobId: string;
  userId: string | null;
  platform: Platform;
  applyUrl: string | null;
  generatedAt: string;
  resume: ResumeRef;
  standardFields: StandardField[];
  profile: Record<string, unknown>;
  customAnswers: Record<string, string>;
  warnings: string[];
}

// Profile fields exposed to the extension for client-side answering of
// page-specific questions. Demographics are intentionally EXCLUDED.
const PROFILE_KEYS: Array<keyof CandidateProfile> = [
  "firstName", "lastName", "fullName", "email", "phone", "location",
  "linkedinUrl", "githubUrl", "portfolioUrl", "websiteUrl",
  "currentCompany", "currentTitle", "yearsOfExperience",
  "highestDegree", "schoolName", "major", "graduationYear",
  "workAuthorization", "requiresSponsorship", "visaStatus",
  "willingToRelocate", "desiredSalary", "noticePeriod",
];

const MIME_BY_EXT: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".doc": "application/msword",
  ".txt": "text/plain",
};

function guessMime(filename: string | null): string | null {
  if (!filename) return null;
  const lower = filename.toLowerCase();
  for (const [ext, mime] of Object.entries(MIME_BY_EXT)) if (lower.endsWith(ext)) return mime;
  return null;
}

const RESUME_NOTE =
  "Fetch downloadUrl and auto-attach via DataTransfer (set input.files, dispatch " +
  "change). Fall back to manual attach on custom upload widgets.";

export interface BuildPackageInput {
  jobId: string;
  applyUrl: string | null;
  profile: CandidateProfile;
  resume: { storageKey: string | null; downloadUrl: string | null; filename: string | null; mimeType?: string | null } | null;
  generatedAt?: string;
}

export function buildApplicationPackage(input: BuildPackageInput): ApplicationPackage {
  const platform = detectPlatform(input.applyUrl);
  const specs = FIELD_MAPS[platform] ?? [];

  const standardFields: StandardField[] = [];
  const missingRequired: string[] = [];
  for (const spec of specs) {
    let value = spec.getter(input.profile);
    value = typeof value === "string" ? value.trim() : value;
    if (value || spec.required) {
      standardFields.push({
        key: spec.key,
        label: spec.label,
        value: value || null,
        required: Boolean(spec.required),
        selectors: spec.selectors,
      });
    }
    if (spec.required && !value) missingRequired.push(spec.label);
  }

  const warnings: string[] = [];
  if (platform === "unsupported") {
    // Name the recognized vendor so the user knows why we can't autofill and to
    // apply manually, instead of a vague "unsupported" message.
    const { vendor } = recognizeAts(input.applyUrl);
    warnings.push(
      vendor
        ? `${vendor} applications aren't auto-fillable yet — open the apply link and submit manually. Your tailored resume and answers are ready to copy.`
        : "This ATS isn't recognized for autofill — open the apply link and submit manually using your prepared resume and answers.",
    );
  }
  if (CAPTCHA_NOTE[platform]) warnings.push(CAPTCHA_NOTE[platform]!);
  warnings.push(
    "Resume auto-attaches from downloadUrl; if the site uses a custom uploader, " +
      "prompt the user to attach it manually.",
  );
  if (missingRequired.length) {
    warnings.push("Missing required profile values (user must fill in): " + missingRequired.join(", "));
  }
  if (!input.resume?.storageKey) {
    warnings.push("No tailored resume was produced; user must attach one.");
  }

  const filename = input.resume?.filename ?? null;
  const resume: ResumeRef = {
    filename,
    storageKey: input.resume?.storageKey ?? null,
    downloadUrl: input.resume?.downloadUrl ?? null,
    mimeType: input.resume?.mimeType ?? guessMime(filename),
    note: RESUME_NOTE,
  };

  return {
    version: PACKAGE_VERSION,
    jobId: input.jobId,
    userId: input.profile.userId,
    platform,
    applyUrl: input.applyUrl,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    resume,
    standardFields,
    profile: profileSubset(input.profile),
    customAnswers: input.profile.customAnswers ?? {},
    warnings,
  };
}

function profileSubset(p: CandidateProfile): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of PROFILE_KEYS) {
    // Defensive: never expose EEO/demographic fields even if they were added to
    // the allowlist by mistake (POLICY enforced here + in the allowlist above).
    if (EEO_KEYS.includes(key)) continue;
    const v = p[key];
    if (v !== null && v !== undefined && v !== "") out[key] = v;
  }
  out["effectiveFullName"] = effectiveFullName(p);
  return out;
}
