# Autofill V2 — Plan (adapter core + browser extension)

_Created 2026-06-23. Status: APPROVED DIRECTION, implementation in progress._

## Goal

Make autofill work across **all** job portals in the market — including the
login-gated ones (Workday, iCIMS, Taleo, SuccessFactors) that the current
server-side engine structurally cannot handle — **without ever regressing the
working Greenhouse autofill.**

## Non-negotiable constraints (from the product owner)

1. **Do NOT delete the current server-side filler.** The Playwright engine
   (`server/services/automation/form-filler.ts`) that achieves ~100% auto-fill on
   Greenhouse is the **golden reference**. It stays live and untouched until Plan B
   is proven across portals. Removal is a *future* backlog item, gated on B working.
2. **Greenhouse is the reference implementation.** Every new platform adapter and
   the extension filler mirror the behavior/selectors that already make Greenhouse
   fill 100%.
3. **Primary autofill rules are preserved everywhere:**
   - Never fabricate answers; escalate low-confidence + sensitive/EEO to the user.
   - Never auto-submit (default) — fill, then the user reviews and clicks Submit.
   - Never store portal credentials; never automate portal login.
   - Hard stops on CAPTCHA / login / account-creation / OTP.
4. **Target: 100% fill** of fillable fields per portal, verified on 2–3 real
   applications per portal before a portal is marked "supported."

## Why this architecture (decision record)

- **Server-side headless cannot pass Workday/iCIMS/Taleo** — they need a per-tenant
  account + email verification + often 2FA, and block datacenter IPs. A backend
  browser has neither the user's session nor their inbox.
- **The durable, ToS-respecting pattern** (Simplify, Huntr, LoopCV all converged on
  it) is a **browser extension that fills the DOM in the user's already-authenticated
  session** and stops before Submit. No credentials stored, user stays in control.
- The current code is already ~80% an adapter design: `field-maps.ts` is the
  declarative per-platform layer, `form-filler.ts` is a platform-agnostic engine,
  and `application-package.ts` already builds the exact JSON contract an extension
  needs. We formalize that boundary rather than rewrite.

## Target shape

```
shared/autofill/            ← ONE source of truth for field knowledge
  adapter.ts                ← PlatformAdapter interface + registry
  adapters/
    greenhouse.ts           ← REFERENCE adapter (mirrors current working selectors)
    lever.ts  ashby.ts  workable.ts
    workday.ts  icims.ts ...← login-gated; extension-only
  field-specs.ts            ← FieldSpec[] (moved/re-exported from current field-maps)

server/
  services/automation/
    form-filler.ts          ← UNCHANGED. Golden Greenhouse path. Server runner for
                              public no-login boards (unattended OK there).
  services/application/
    application-package.ts  ← extended to emit adapter id + capability hints

extension/                  ← NEW (Manifest V3, built with Vite — reuses React + TS)
  manifest.json
  src/content/filler.ts     ← client-side runner: detect → fill → STOP before submit
  src/content/engine.ts     ← port of the form-filler resolution ladder to the DOM
  src/popup/                ← React popup: status, "Fill this application", review
  src/background.ts         ← fetches ApplicationPackage via existing API + JWT
```

The **same** `PlatformAdapter` + `FieldSpec` definitions are consumed by both the
server-side runner and the extension content script. Add a platform once → both
paths get it.

## Server changes are minimal (contracts already exist)

The extension reuses endpoints that already ship:
- `GET /api/applications/:id` → returns the `ApplicationPackage` (selectors,
  profile subset, customAnswers, resume `downloadUrl`).
- `POST /api/applications/:id/answers` → QA with all guardrails (never-fabricate,
  sensitive escalation).
- `POST /api/applications/:id/mark-applied` → records completion after the user
  submits.

New, additive only:
- Extend `ApplicationPackage` with `adapterId` + `capabilities` (multiStep,
  requiresLogin, etc.) so the extension knows how to drive each portal. Adding
  fields is backward-compatible (version stays "1", extension tolerates absence).
- (Later) a token/handshake endpoint so the extension can authenticate to the API.

## PlatformAdapter interface (the core abstraction)

```ts
interface PlatformAdapter {
  id: Platform;                 // "greenhouse" | "lever" | ... | "workday"
  detect(url: string): boolean; // URL match (today's platform-detector logic)
  fieldSpecs: FieldSpec[];      // declarative selectors (today's field-maps)
  capabilities: {
    autofillSupported: boolean;
    requiresLogin: boolean;     // Workday/iCIMS = true → extension-only
    multiStep: boolean;         // wizard with Next/Continue between pages
    canAutoSubmit: boolean;     // policy: always false for now
  };
  // Optional hooks — DEFAULT implementations cover 90% of portals (= current
  // engine). Only weird portals override these.
  navigateToForm?(page): Promise<void>;   // follow apply link / click Apply
  advanceStep?(page): Promise<boolean>;    // Workday "Next" between wizard pages
  detectSubmit?(page): Promise<Locator>;   // non-standard submit button
}
```

90% of portals = the **default adapter** (= today's `form-filler.ts` behavior).
Greenhouse/Lever/Ashby/Workable already work on defaults + their `fieldSpecs`.
Workday adds `multiStep` + `advanceStep` + `requiresLogin` and is **extension-only**.

## Phased sequence

**Phase A — Adapter core + widen no-login coverage (server-side, additive).**
- A1. Add `shared/autofill/adapter.ts` (interface + registry) — NEW files, no edits
  to working code. Greenhouse adapter wraps the existing field map (reference).
- A2. Migrate the 4 existing maps into adapters; `field-maps.ts` re-exports from
  the shared module (shim) so `form-filler.ts` / `application-package.ts` keep
  importing the same names — **zero behavior change, proven by existing tests.**
- A3. Add adapters for public no-login boards (SmartRecruiters public, Recruitee,
  Breezy, Teamtailor, Jobvite public). Each is a ~30-line adapter + tests.
- A4. Coverage report: % fillable per platform.

**Phase B — Browser extension for gated + reliable default.**
- B1. Scaffold MV3 extension (Vite + React popup, TS content script).
- B2. Port the resolution ladder (deterministic label fill → semantic QA → re-loop)
  from `form-filler.ts` to a DOM engine. Greenhouse first → match the 100% baseline.
- B3. Wire to existing API (fetch package, answer questions, mark-applied).
- B4. Workday adapter: detect tenant, fill by `data-automation-id` + label, advance
  steps, **hard stop before final Submit**. Then iCIMS/Taleo/SuccessFactors.
- B5. Enforce primary rules in-extension (no credentials, no auto-submit, sensitive
  escalation surfaced in popup).

**Phase C — Cutover (future, gated).** Once B is proven across portals, decide
per-portal whether the extension replaces the server-side path. Only then remove
the commented-out / superseded server code. Tracked in backlog, NOT done now.

## Verification plan (honest about what can be automated)

- **Automated here:** unit/integration tests per adapter (selector resolution,
  fieldSpec coverage, capability flags), package-builder tests, QA-guardrail tests,
  a DOM-fixture harness for the extension engine (saved real form HTML → assert
  100% fill + no sensitive auto-fill).
- **Requires the product owner's live browser (cannot run in CI/agent):** driving
  2–3 **real** applications per portal end-to-end. Login-gated portals (Workday)
  by definition need a human-authenticated session. Deliverable: a per-portal
  **verification checklist** + the existing `scripts/test-autofill.ts` (server path)
  and an extension "dev fill on current tab" mode for manual runs.

### Per-portal acceptance (each portal, 2–3 real apps)
- [ ] 100% of fillable standard fields populated.
- [ ] No fabricated answers; low-confidence + sensitive/EEO escalated to user.
- [ ] No credentials stored; no auto-login; no auto-submit.
- [ ] Resume attached (or clear manual-attach prompt if custom uploader).
- [ ] Coverage report shows only Submit remaining.

## Risk controls

- All Phase A work is **additive** (new files + re-export shims). The Greenhouse
  Playwright path is never edited. Existing test suite is the regression gate.
- The extension is a **separate package**; it cannot break the server build.
- Cutover (deleting old code) is deferred to Phase C, gated on proven Plan B.
