// Autofill V2 — the wire contract between the server (which builds the package)
// and the browser extension (which consumes it to fill the live form).
// Dependency-free; structurally matches server ApplicationPackage. The extension
// imports THESE types (it must not import server code).

import type { AdapterId, AdapterCapabilities } from "./adapter.js";

export interface WireStandardField {
  key: string;
  label: string;
  value: string | null;
  required: boolean;
  selectors: string[];
}

export interface WireResumeRef {
  filename: string | null;
  storageKey: string | null;
  downloadUrl: string | null;
  mimeType: string | null;
  note: string;
}

export interface WireApplicationPackage {
  version: string;
  jobId: string;
  userId: string | null;
  /** Server platform id; "unsupported" for login-gated portals (use adapterId). */
  platform: string;
  adapterId: AdapterId;
  capabilities: AdapterCapabilities;
  applyUrl: string | null;
  generatedAt: string;
  resume: WireResumeRef;
  standardFields: WireStandardField[];
  profile: Record<string, unknown>;
  customAnswers: Record<string, string>;
  warnings: string[];
}

/** Outcome the extension reports back (mirrors server FillResult, DOM-side). */
export interface FillReport {
  adapterId: AdapterId;
  filledCount: number;
  filledLabels: string[];
  /** Required controls still blank after filling. */
  blanks: Array<{ label: string; kind: string }>;
  /** Questions/fields surfaced to the user (low confidence, sensitive, or EEO). */
  needsReview: Array<{ label: string; reason: "sensitive" | "eeo" | "low_confidence" | "unknown" }>;
  /** Hard stop encountered (never bypassed). */
  blocker: "captcha" | "login" | "account_creation" | "otp" | null;
  /** Always false — the extension NEVER auto-submits; the user clicks Submit. */
  submitted: false;
  /** Steps advanced (multi-step wizards like Workday). */
  stepsAdvanced: number;
}
