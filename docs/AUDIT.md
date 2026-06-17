# End-to-End Product Audit & TODO

Audit of the full workflow (UI → backend → DB → application engine) with a
prioritized action list. Validated against a live run on a throwaway Postgres.

## 1. Workflow validation (output → next input)

| Step | Output | Next input | Status |
|---|---|---|---|
| Signup/Login | JWT + User | `requireAuth` reads JWT | ✅ matches |
| Onboarding form | `OnboardingFormData` | `onboardingSchema` → `UserProfile`/`UserPreference` | ⚠️ form/schema only cover ~10 of the generic ATS fields |
| Resume upload | file → Claude → `parsedJson` + `rawText` | `loadCandidateProfile` reads `Resume.rawText` | ✅ (rawText feeds tailoring) |
| Candidate profile | `CandidateProfile` | tailor / qa / packager / form-filler | ⚠️ many fields *derived* (name split, currentTitle from experienceJson) or absent (address, EEO, sponsorship) |
| Ingestion | `Job` rows | pipeline reads `Job` by run | ✅ matches |
| Scoring | `JobMatch` | pipeline shortlist | ✅ matches |
| Doc generation | `ApplicationDocument` + status | Review UI reads them | ✅ matches |
| Autofill package | `standardFields` + selectors | form-filler + extension | ⚠️ only Greenhouse/Lever; custom careers domains (e.g. stripe.com) → unsupported |
| Submit | automation `code` | `mapFillCodeToStatus` → `Application.status` | ✅ matches; UI badges cover all statuses |
| UI status/counts | `/api/applications`, `/api/stats` | dashboard/applications/review | ✅ matches |

## 2. Findings

**Working:** auth + ownership; onboarding/profile/preferences persistence; resume
upload+parse; ingestion (Greenhouse/Lever); scoring; pipeline worker; resume
tailoring chokepoint (skill → DOCX); Q&A with sensitivity gates; application
package; Playwright form-filler with safe handoff; Stripe (checkout/verified
webhook/portal) + test-mode activate; status mapping; review/applications/billing
UI on live data; cost tracking; centralized config; 45 unit tests; build.

**Missing / incomplete:**
- **Generic ATS questions** collected only partially. No legal/preferred name,
  address parts, sponsorship boolean, current employer/title (explicit), education
  detail (school/degree/major/grad year), notice period, availability, EEO
  (gender/race/veteran/disability), how-heard/referral, consent.
- No explicit separation of **generic reusable data** vs role-specific (role-specific
  is already isolated in `ApplicationAnswer` — good; generic store needs widening).
- Platform coverage limited to Greenhouse + Lever (no Ashby/Workable detection).
- No retry counter on `Application` (events exist; explicit count missing).
- Profile editor doesn't expose the new generic fields.

**Broken:** (fixed this session) Express 5 wildcard route crashed boot — fixed.

**Schema/IO mismatch:** `CandidateProfile` exposes fields (`currentCompany`,
`requiresSponsorship`, demographics) that `UserProfile` doesn't store, so they were
always null → autofill/Q&A under-filled. Fixed by widening `UserProfile`.

**Unnecessary files:** `infra/` Terraform (25 `.tf` files) — GCP platform infra not
used in the current local/test workflow → removed (recoverable via git; productionize
later from history). Kept `Dockerfile`/`cloudbuild.yaml`/`.github` for the upcoming
productionization. Admin billing page references a *separate* GCP F&B product
(BigQuery marts) — flagged P2 (feature surface, not part of this workflow).

## 3. TODO (prioritized)

### P0 — must fix to run end-to-end (done this session)
- [x] Widen `UserProfile` with all generic ATS fields (identity, address, work auth,
      employment, education, logistics, EEO optional, consent).
- [x] Expand `onboardingSchema` + `profileSchema` validation for the new fields.
- [x] Persist new fields in onboarding route + `profile-service`.
- [x] `candidate-profile` reads explicit fields (no fragile derivation).
- [x] `field-maps` use the explicit fields; add Ashby + Workable detection + maps.
- [x] Onboarding "Application Details" step collects generic questions once.
- [x] `Application.retryCount` for retry history.

### P1 — before productionizing (done)
- [x] Profile editor UI: expose/edit every new generic field — new **Application Details**
      tab; Experience tab now shows real parsed data (was a placeholder). Profile saves
      are now partial (skip-undefined) so independent tabs don't clobber each other.
- [x] Resume parse → auto-populate the new structured fields. `/upload-parse` now
      persists a Resume row (rawText → tailoring; previously nothing was stored) and
      non-destructively fills blank profile fields (skills/experience/education + derived
      currentEmployer/title/school/degree/major/gradYear). Resume page rewired to live data.
- [x] Map company careers domains → ATS. `recognizeAts()` names known-but-unsupported
      vendors (Workday/SmartRecruiters/iCIMS/…) so the package tells the user to apply
      manually; careers-domain map resolves typed URLs/domains (e.g. `stripe.com`) to a board.
- [x] Retry queue / scheduler. `retry-service` + `retry-worker` (interval, config-gated)
      + `POST /applications/:id/retry` + UI retry action on failed rows.
- [x] Plan-based application limits. `usage-limits` service; pipeline shortlist capped by
      `min(applicationsPerDay, remaining monthly plan allowance)`; usage surfaced on the
      subscription endpoint + a usage bar on the Billing page.

### P2 — important improvements (done)
- [x] Admin billing surface — **decision: keep** the AI-cost + user-billing dashboard
      (real data from `AIUsageEvent`); **removed** the GCP/BigQuery "backlog" placeholders
      (out-of-scope data-platform product per CLAUDE.md). Dropped the `cloud` API field + UI.
- [x] EEO autofill policy — made explicit: `EEO_KEYS` constant + defensive exclusion in the
      packager + a test asserting EEO values never appear anywhere in the package.
- [x] Code-split the client bundle — routes are `React.lazy` + `Suspense`; Vite `manualChunks`
      splits vendor/charts/radix. Main entry chunk dropped from ~779 kB to ~41 kB.

### P3 — nice to have (done)
- [x] Email notifications — provider-agnostic `email-service` (log transport, no keys
      needed); run-completion notification fires from the pipeline.
- [x] Audit-log viewer — `GET /api/activity` + **Activity** page (application + subscription
      event timeline).
- [x] Data export/delete — `GET /api/account/export` (full JSON, passwordHash redacted) +
      `DELETE /api/account` (cascade); wired into Settings (Privacy & Data + Danger Zone).
- [x] Consent/disclaimer before automation — `/submit` is gated on
      `consentToDataProcessing`; Review page shows a disclaimer and surfaces the gate message.

### B3 — post-launch hardening (Phase 3)
- [x] **Single-store migration** — generated documents moved from GCS/local-fs into
      Postgres (`Artifact` table, BYTEA). No external object store; survives restarts.
      `@google-cloud/storage` dependency + `GCS_BUCKET_NAME` env removed.
- [x] **DB indexes for billing aggregations** — `Application(userId,status,createdAt)`,
      `AIUsageEvent(userId,createdAt)` + `(createdAt)`. Plus opt-in slow-query logging
      (`SLOW_QUERY_MS`) in `server/lib/db.ts`.
- [x] **GDPR audit trail + retention policy** — `AuditLog` model (no FK on `userId`, so
      it survives deletion) + `recordAudit()` helper; export/delete now write audit rows.
      Written policy in `docs/DATA_RETENTION.md`.
- [x] **Unsupported-resume-format feedback** — multer rejections become clear 400s
      ("Unsupported file type…", "too large"), empty/scanned-PDF detection, and the
      onboarding/resume UIs surface the specific server message.
- [x] **Manual-submit handoff UI** — Review page surfaces the apply URL + an "I've
      submitted it" action for blocked/assisted statuses; new `POST /:id/mark-applied`.
- [x] **Stripe webhook signature tests** — fails-closed when unconfigured; rejects a
      forged signature when a secret is set.
- [x] **Integration tests** — `*.integration.test.ts` (DB-backed) + `test:integration`
      script + dedicated config; excluded from the DB-free CI `npm test` run.
- [ ] **#16 Resume re-attachment vs real ATS file inputs** — DEFERRED: needs live ATS
      application forms to validate the file-attach step against real DOM inputs; cannot
      be exercised without external, login-gated ATS pages. Revisit during a real pilot.

### Also fixed this session
- Express 5 production SPA fallback used a bare `*` (would crash boot in prod) → `/*splat`.
- Onboarding resume upload posted without the auth token (would 401) → now attaches it.
- Corrected the onboarding upload copy that claimed the original file is stored — only the
  extracted text is kept (the upload is discarded after parsing).
