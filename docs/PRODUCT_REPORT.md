# JobPilot — Product Build Report

End-to-end job-application automation product, built on the existing Job-Pilot
codebase and the merged `Job_applying_agent` logic. This report covers the audit,
what was built, and how each subsystem works.

## 1. Audit of the starting codebase

| Area | State at start | Action |
|---|---|---|
| Frontend (React 19 + Vite + Tailwind + Radix) | Solid; pages mostly real, Review/Billing mocked | Reused; wired Review + Billing to live data |
| Backend (Express 5 BFF, modular routes) | Solid | Reused; added routes |
| Auth (JWT + bcrypt, `requireAuth`, ownership checks) | Working | Reused as-is |
| Profile (routes + onboarding UI) | Working | Reused; added unified `CandidateProfile` loader |
| DB (Prisma/PostgreSQL, ~20 models) | Working, normalized | Reused; **additive** `metadataJson` + expanded status enum |
| Job fetching (Greenhouse/Lever ingestion) | Working | Reused; chained into the pipeline |
| Match scoring (Claude) | Working | Reused in the pipeline |
| Resume tailoring | **Missing** | Built (skill chokepoint) |
| Job applying / automation | **Missing** | Built (Playwright form-filler + handoff) |
| Subscription / payment | Stub (manual `/activate` only) | Built real **Stripe** checkout + verified webhook + portal |
| Config | Minimal `env.ts` | Built **centralized `config.ts`** + `.env.example` |
| BigQuery | None functional (only comments about a separate GCP product) | Confirmed Postgres-only |
| Tests | 2 files | 10 files / 45 tests |

**Risks addressed:** webhook signature verification, prod-disabled manual
activation, ownership checks on file downloads, graceful degradation (no AI / no
Stripe / no Playwright), and a hard safety boundary around CAPTCHA/login.

## 2. What was built (this product phase, on top of the merge)

- **Centralized config** — `server/lib/config.ts` (single source: URLs, DB, JWT,
  Anthropic + model overrides, Stripe, storage, automation, limits) + `.env.example`.
  `env.ts` re-exports it for back-compat.
- **Stripe** — `server/services/billing/stripe-service.ts` (checkout, billing
  portal, signature-verified webhook resolver) wired into `subscription` routes;
  raw-body webhook mounted before `express.json()` in `server/index.ts`.
  Activation initializes user data and starts the pipeline. Test-mode `/activate`
  retained (disabled in production).
- **Status vocabulary** — `ApplicationStatus` enum expanded to the requested set
  (`TAILORED_RESUME_READY`, `READY_FOR_USER_SUBMIT`, `CAPTCHA_REQUIRED`,
  `LOGIN_REQUIRED`, `QUESTION_NEEDS_REVIEW`, `FAILED_TECHNICAL`,
  `SKIPPED_UNSUPPORTED`, …). `status-map.ts` maps automation outcomes
  deterministically; surfaced in the Applications + Review UIs.
- **UI** — Billing page (real subscription, Stripe checkout / test-mode activate,
  manage-billing portal, success/cancel handling); Review queue badges for the new
  statuses.
- **Tests** — config, status-map, Stripe webhook resolver (plus the merge's
  platform-detector, qa-generator, application-package, resume-renderer).

(The resume tailoring, Q&A, packaging, automation, worker pipeline, and document
download route were delivered in the merge phase — see `docs/MERGE_ANALYSIS.md`.)

## 3. How each subsystem works

- **Auth**: JWT (`requireAuth`), bcrypt hashing, per-user ownership checks on every
  resource (applications, files).
- **Profile**: `UserProfile`/`UserPreference` (+ parsed resume). `loadCandidateProfile`
  assembles the unified fact-only view the pipeline consumes.
- **Stripe**: Billing → checkout session → Stripe-hosted payment → verified webhook
  → `activateSubscription` (flips status, writes `SubscriptionEvent`, initializes
  user data, starts pipeline). Access to automation is gated on `status==="active"`.
- **PostgreSQL tables**: normalized relational schema (not per-user physical tables —
  a deliberate improvement over the legacy `{first}_{last}_jobs` BigQuery pattern;
  rows are per-user with `@@unique([userId, dedupeKey])`). Activation ensures the
  per-user `UserPreference` row; the pipeline creates `Job`/`Application` rows per run.
- **Job fetching**: `ingestion-orchestrator` pulls Greenhouse/Lever public boards
  from the user's target companies, normalizes, dedupes, stores in `Job`.
- **Resume tailoring**: always routes through the bundled `ats-resume-tailoring`
  skill → Claude JSON → Zod-validated → verified contact force-applied → deterministic
  ATS-safe DOCX. Never tailors outside the skill.
- **Job applying / handoff**: Playwright fills standard fields + answers + resume.
  `AUTO_SUBMIT=false` → `READY_FOR_USER_SUBMIT`; CAPTCHA/login/OTP → their handoff
  statuses; success → `APPLIED`. Bot protections are never bypassed.
- **UI status**: Applications + Review read live statuses (auto-refreshing) so the
  user sees exactly what happened with each job.

## 4. Known limitations / next steps
- ATS coverage is Greenhouse + Lever (extensible via `field-maps.ts` + a detector branch).
- Artifact storage is local-disk with a GCS seam (`artifact-storage.ts`) — wire
  `@google-cloud/storage` for multi-instance prod.
- Plan-based application limits, email notifications, retry queue, and a scheduler
  are recommended next (the worker is already fire-and-forget; add a real queue +
  cron for scale).
- A consent/disclaimer screen before automation is recommended for production.
- Playwright browsers must be present in the runtime image for the submit step.
