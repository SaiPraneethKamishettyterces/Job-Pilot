# JobPilot — Tasks Backlog (sequenced roadmap)

A running, **ordered** plan of work. Phases run top-to-bottom; within a phase,
items are listed in the order they're best tackled. Append freely; move finished
items to **Done** at the bottom (don't delete).

**Sequencing rationale:** build the product's core value first (get the best jobs
in, fill them well, reach more portals) → then monetize (plans + financial
visibility) → then polish the experience → then prove it with tests → and only
**after** end-to-end passes, take it fully online on Google Cloud, independent of
any local machine. Deployment is deliberately **last**.

_Created 2026-06-17 · last re-sequenced 2026-06-17_

Legend: ☐ todo · ◐ partial (foundation shipped) · ☑ done

---

## Phase 1 — Core product value (matching, filling, reach)

### 1.1 Deepen "best-N jobs" matching  ◐
_Foundation shipped: full-resume scoring + global top-N ranking + already-applied exclusion._
- ☐ Add ranking signals beyond skills: seniority fit, location/remote alignment, salary fit, posting recency.
- ☐ Shortlist diversity: cap near-duplicate roles / per-company count so the 30 aren't all the same job.
- ☐ Feedback loop: learn from user approve/decline to adjust scoring + auto-calibrate `matchThreshold`.
- ☐ Never resurface declined/archived jobs (extend the already-applied guard).
- ☐ Quality eval: hand-label a sample, measure precision of the top-N, tune weights.

### 1.2 Broaden job sources (no-login boards only)  ☐
- ☐ Audit market sources with public, no-login, no-CAPTCHA postings (Ashby public, Workable public, SmartRecruiters public API, Remotive/RemoteOK feeds, …). Record ToS for each.
- ☐ Add a fetcher per viable source in `services/ingestion/ats-sources.ts` (mirror the Greenhouse/Lever pattern).
- ☐ Normalize each into the common `Job` shape + dedup key (`job-normalizer.ts`).
- ☐ Per-source enable flags + config; keep the "no bot-protection bypass" rule.
- ☐ Unit tests per fetcher (mocked responses).

### 1.3 Full application-field coverage  ☐
- ☐ Catalog the fields real ATS forms ask for (start with Greenhouse, Lever, Ashby, Workable; then more).
- ☐ Expand `field-maps` with every standard field + selectors per platform.
- ☐ Expand the profile data model + onboarding to capture all data those fields need.
- ☐ Handle field types: text, dropdown/select, multi-select, dates, file upload, yes/no.
- ☐ Coverage report: % of fields auto-fillable per platform; close the gaps.

### 1.4 Smarter autofill + best-practice question answering  ◐
_Foundation shipped: semantic question→stored-answer matching (embeddings)._
- ☐ Comprehensive generic-question bank mapped to profile fields / stored answers.
- ☐ Improve the question-answering skill/prompt so the LLM follows best-practice instructions for job-specific questions.
- ☐ Tune semantic-match threshold + cache stored-question embeddings.
- ☐ Handle answer formats: free-text, yes/no, multi-select, scale, file.
- ☐ Guardrails: never fabricate; always escalate low-confidence + sensitive/EEO to the user.

### 1.5 Make signup/login-required portals (Workday, …) low-effort  ☐
- ☐ Per-portal detection → tailored, guided "how to apply" steps in the UI.
- ☐ Pre-fill everything possible into the assisted package; minimize manual steps.
- ☐ Decision: credential handling for these portals (default: guided manual login, do NOT store passwords) — respect ToS / no bot-protection bypass.
- ☐ Track status through the manual steps; one-click "mark submitted" (reuse existing handoff).

---

## Phase 2 — Monetization & financial visibility

### 2.1 Tiered plans by daily volume + pricing  ☐
- ☐ Define tiers: 30/day, 50/day, 75/day (+ free) — monthly caps + prices.
- ☐ Seed `Plan` rows; wire Stripe prices (test mode first).
- ☐ Enforce per-day cap (scheduler) + monthly allowance (pipeline) per tier (extends existing caps).
- ☐ Plan selection + upgrade/downgrade UI (+ proration handling).
- ☐ Tests: cap enforcement per tier.

### 2.2 Fine-grained admin billing/financial dashboard  ☐
_(Depends on 2.1 for revenue/margin; uses indexes already added.)_
- ☐ Metrics: total cost, cost per user, AI cost by task/model, infra cost, revenue, margin, trends over time.
- ☐ Cost attribution per run/application; admin-only aggregation endpoints.
- ☐ Admin UI: recharts charts + tables, date ranges, per-user drill-down.
- ☐ Admin-only access control.

---

## Phase 3 — User experience polish

### 3.1 Dashboard + day-wise applications view  ☐
- ☐ Applications page grouped **by day**: what happened each day + each application's status, clearly organized.
- ☐ Per-application status timeline (discovered → generated → review → submitted).
- ☐ Dashboard metric accuracy + proper empty/loading/error states.
- ☐ Apply the design system consistently; responsive.

---

## Phase 4 — Testing & QA (the gate before going live)

### 4.1 End-to-end test (runs fully free)  ☐
- ☐ E2E covering the whole flow: signup → onboarding → run → score → generate → review → assisted submit, runnable for free (Gemini free tier + Stripe test mode).
- ☐ Seed/teardown fixtures for a clean test run.

### 4.2 Click/connection coverage — everything wired  ☐
- ☐ Verify every button/component is connected to its real data source (no dead UI).
- ☐ Component + integration tests for the high-traffic pages.
- ☐ API contract + auth/rate-limit tests.
- ☐ CI runs unit (and optionally e2e) as a required gate.

---

## Phase 5 — FINAL: go fully online on Google Cloud (independent of local)

_Only start after Phase 4 e2e passes. Goal: the product runs 24/7 in the cloud,
not on any local machine, and is verified end-to-end in that cloud environment._

- ☐ Provision **Cloud SQL (Postgres)**; run `prisma migrate deploy`; point `DATABASE_URL` at it. (Artifacts already live in Postgres — no GCS needed.)
- ☐ Build + push the image to **Artifact Registry**; deploy **Cloud Run** (existing `Dockerfile` + deploy workflow).
- ☐ Put all secrets in **Secret Manager**: `DATABASE_URL`, `JWT_SECRET`, `ANTHROPIC_API_KEY`, `AI_COMPAT_API_KEY`, Stripe keys.
- ☐ **Daily-scheduler reliability in the cloud**: either `min-instances=1` (always-warm) OR an external **Cloud Scheduler** cron that pings the run endpoint each morning (Cloud Run scales to zero otherwise).
- ☐ Lock down CORS/allowed origins; custom domain + HTTPS.
- ☐ Observability: error reporting + readiness checks + basic alerts.
- ☐ **Run the end-to-end test against the deployed cloud environment** and confirm green.

---

## Done

- ☑ 2026-06-17 — Single Postgres store for generated artifacts (dropped GCS).
- ☑ 2026-06-17 — Phase-3 hardening: DB indexes, GDPR audit trail + retention doc, resume-format feedback, manual-submit handoff, webhook tests.
- ☑ 2026-06-17 — Daily auto-apply scheduler (in-process, fixed time).
- ☑ 2026-06-17 — AI refinement: free Gemini provider (tailoring stays on Claude), best-N matching foundation, semantic Q&A foundation.
