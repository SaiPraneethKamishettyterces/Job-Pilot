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

### P1 — before productionizing
- [ ] Profile editor UI: expose/edit every new generic field (partial now).
- [ ] Resume parse → auto-populate the new structured fields (currently only rawText).
- [ ] Map company careers domains → ATS (widen autofill beyond greenhouse.io/lever.co).
- [ ] Retry queue / scheduler for failed applications.
- [ ] Plan-based application limits enforcement.

### P2 — important improvements
- [ ] Decide on the admin billing surface (separate GCP product) — keep/remove.
- [ ] EEO autofill policy review (stored, currently excluded from auto-fill by design).
- [ ] Code-split the 779 kB client bundle.

### P3 — nice to have
- [ ] Email notifications, audit-log viewer UI, data export/delete (privacy),
      consent/disclaimer screen before automation.
