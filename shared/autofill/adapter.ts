// Autofill V2 — shared platform-adapter metadata + capabilities + detection.
//
// SINGLE SOURCE OF TRUTH for "which ATS is this, and how must autofill drive it",
// imported by BOTH the Express server (to stamp adapterId/capabilities onto the
// ApplicationPackage) and the browser extension (to pick the right fill flow).
// Like shared/validation.ts, keep this file DEPENDENCY-FREE so it resolves under
// the server's NodeNext build and the extension/client bundler alike.
//
// This is purely ADDITIVE. It does NOT replace server/services/automation/
// field-maps.ts (FieldSpec getters that need CandidateProfile stay server-side)
// or platform-detector.ts (the working Greenhouse path is untouched). Phase A2
// reconciles the server `Platform` type with `AdapterId` via re-export shims.
//
// See docs/AUTOFILL_V2_PLAN.md and BACKLOG.md §1.7.

// Canonical platform ids. Superset of the server's current `Platform` type:
// adds public no-login boards (Phase A) and login-gated portals (Phase B).
export type AdapterId =
  // Currently auto-fillable (server-side Playwright today; extension later):
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  // Public, no-login boards to add in Phase A (server-side OK):
  | "smartrecruiters"
  | "recruitee"
  | "breezy"
  | "teamtailor"
  | "jobvite"
  // Login-gated portals — EXTENSION ONLY (server-side cannot pass the auth wall):
  | "workday"
  | "icims"
  | "taleo"
  | "successfactors"
  | "bamboohr"
  // No adapter matched:
  | "unsupported";

export interface AdapterCapabilities {
  /** We can drive a real autofill (vs. copy/paste-only fallback). */
  autofillSupported: boolean;
  /**
   * Portal requires an authenticated account (per-tenant signup / login). When
   * true, the server-side Playwright runner MUST NOT attempt it — only the
   * browser extension (user's own session) can. This is the Workday/iCIMS class.
   */
  requiresLogin: boolean;
  /** Multi-page wizard with Next/Continue between steps (e.g. Workday). */
  multiStep: boolean;
  /**
   * Which runner should handle this portal.
   *  - "server"    : public no-login form, unattended server-side fill is fine.
   *  - "extension" : login-gated; only the in-session extension can fill it.
   *  - "either"    : extension preferred (more reliable), server allowed.
   */
  runner: "server" | "extension" | "either";
  /**
   * POLICY: auto-submit is always false for now. Filling stops before Submit so
   * the user reviews and submits. Kept as a field so the policy is explicit and
   * a future per-portal change is a data edit, not a code hunt.
   */
  canAutoSubmit: false;
}

export interface PlatformAdapterMeta {
  id: AdapterId;
  /** Human-readable vendor name for UI messaging. */
  vendorLabel: string;
  /** Lowercased substrings; a URL matches the adapter if it contains any. */
  urlMatches: string[];
  capabilities: AdapterCapabilities;
  /** Short "how to apply" guidance shown for gated/unsupported portals. */
  guidance?: string;
}

// Defaults: the common case is a public, single-page, no-login form fillable by
// either runner, never auto-submitted.
const PUBLIC: AdapterCapabilities = {
  autofillSupported: true,
  requiresLogin: false,
  multiStep: false,
  runner: "either",
  canAutoSubmit: false,
};

// Login-gated portals: extension-only, often multi-step, never auto-submit.
function gated(multiStep = false): AdapterCapabilities {
  return {
    autofillSupported: true,
    requiresLogin: true,
    multiStep,
    runner: "extension",
    canAutoSubmit: false,
  };
}

// Registry. Order matters only for detection (first match wins); ids are unique.
// URL substrings mirror server/services/automation/platform-detector.ts so the
// two stay consistent until A2 unifies them.
export const ADAPTERS: PlatformAdapterMeta[] = [
  // ── Currently auto-fillable (reference: Greenhouse is the golden path) ──
  { id: "greenhouse", vendorLabel: "Greenhouse", urlMatches: ["greenhouse.io"], capabilities: PUBLIC },
  { id: "lever", vendorLabel: "Lever", urlMatches: ["lever.co"], capabilities: PUBLIC },
  { id: "ashby", vendorLabel: "Ashby", urlMatches: ["ashbyhq.com"], capabilities: PUBLIC },
  { id: "workable", vendorLabel: "Workable", urlMatches: ["workable.com"], capabilities: PUBLIC },

  // ── Phase A: public no-login boards (server-side OK) ──
  { id: "smartrecruiters", vendorLabel: "SmartRecruiters", urlMatches: ["smartrecruiters.com"], capabilities: PUBLIC },
  { id: "recruitee", vendorLabel: "Recruitee", urlMatches: ["recruitee.com"], capabilities: PUBLIC },
  { id: "breezy", vendorLabel: "Breezy", urlMatches: ["breezy.hr"], capabilities: PUBLIC },
  { id: "teamtailor", vendorLabel: "Teamtailor", urlMatches: ["teamtailor.com"], capabilities: PUBLIC },
  { id: "jobvite", vendorLabel: "Jobvite", urlMatches: ["jobvite.com"], capabilities: PUBLIC },

  // ── Phase B: login-gated (EXTENSION ONLY) ──
  {
    id: "workday", vendorLabel: "Workday", capabilities: gated(true),
    urlMatches: ["myworkdayjobs.com", "workday.com", ".wd1.", ".wd3.", ".wd5."],
    guidance:
      "Workday needs an account per company. In the extension: sign in (or create the account once), then we fill each step and stop before Submit so you review and submit.",
  },
  {
    id: "icims", vendorLabel: "iCIMS", urlMatches: ["icims.com"], capabilities: gated(true),
    guidance: "iCIMS often supports 'Apply with LinkedIn' or resume upload to prefill; the extension fills the rest in your session.",
  },
  {
    id: "taleo", vendorLabel: "Taleo", urlMatches: ["taleo.net"], capabilities: gated(true),
    guidance: "Taleo requires an account. Register/sign in, then the extension fills the form in your session and stops before Submit.",
  },
  {
    id: "successfactors", vendorLabel: "SuccessFactors", urlMatches: ["successfactors.com", "sapsf.com"], capabilities: gated(true),
    guidance: "SAP SuccessFactors requires an account. Sign in, then the extension fills the form in your session.",
  },
  {
    id: "bamboohr", vendorLabel: "BambooHR", urlMatches: ["bamboohr.com"], capabilities: gated(false),
    guidance: "Short form — the extension fills it in your session; attach your tailored resume.",
  },
];

const UNSUPPORTED: PlatformAdapterMeta = {
  id: "unsupported",
  vendorLabel: "Unknown ATS",
  urlMatches: [],
  capabilities: { autofillSupported: false, requiresLogin: false, multiStep: false, runner: "extension", canAutoSubmit: false },
};

/** Detect the adapter for an apply URL (first substring match wins). */
export function detectAdapter(url: string | null | undefined): PlatformAdapterMeta {
  if (!url) return UNSUPPORTED;
  const u = url.toLowerCase();
  for (const a of ADAPTERS) {
    if (a.urlMatches.some((m) => u.includes(m))) return a;
  }
  return UNSUPPORTED;
}

/** Lookup an adapter by id (falls back to the unsupported sentinel). */
export function adapterById(id: AdapterId): PlatformAdapterMeta {
  return ADAPTERS.find((a) => a.id === id) ?? UNSUPPORTED;
}
