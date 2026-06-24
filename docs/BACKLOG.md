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

### 1.6 Standardized job-match scoring skill/prompt  ☐
_(A repeatable, transparent rubric the LLM/Claude follows every time it scores a job→resume match — so scores are consistent, explainable, and tunable rather than ad-hoc per call. Lives in `server/services/ai`/matching; complements 1.1's signals.)_
- ☐ Define a **standard scoring rubric**: enumerate the factors (hard-skill overlap, seniority/title fit, years-of-experience fit, location/remote alignment, salary fit, industry/domain fit, posting recency, must-have/disqualifier checks, soft-skill/keyword signals) with explicit weights that sum to a normalized 0–100 score.
- ☐ Author the scoring **skill/prompt**: a structured prompt that walks the model through each factor in order, scores each sub-factor with a short justification, then combines into the final weighted score (chain-of-thought → structured JSON output).
- ☐ **Structured, machine-readable output**: force a schema — `{ overallScore, perFactor: [{factor, score, weight, reasoning}], mustHavesMet, disqualifiers, confidence }` — so results are storable, auditable, and drive the top-N ranking deterministically.
- ☐ **Hard gates vs soft signals**: hard disqualifiers (missing must-have credential, visa/location impossibility) cap or zero the score regardless of other factors; everything else contributes proportionally.
- ☐ **Consistency & calibration**: same input → same score (low/zero temperature, fixed rubric version); version the rubric so score changes are traceable; back-test against hand-labeled samples (ties into 1.1 quality eval).
- ☐ **Explainability**: every score carries the per-factor reasoning so the user/admin can see *why* a job ranked where it did.
- ☐ Make weights/rubric **configurable** (config-driven, not hard-coded) so scoring can be tuned without code changes.
- ☐ Tests: rubric produces stable scores on fixtures; disqualifier gating works; output always conforms to the schema.

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

### 1.5 Make signup/login-required portals (Workday, …) low-effort  ◐
_Superseded/expanded by **1.7 Autofill V2** below — the browser-extension path is
the chosen way to make these portals low-effort. Keep these as acceptance criteria._
- ☐ Per-portal detection → tailored, guided "how to apply" steps in the UI.
- ☐ Pre-fill everything possible into the assisted package; minimize manual steps.
- ☐ Decision: credential handling for these portals (default: guided manual login, do NOT store passwords) — respect ToS / no bot-protection bypass.
- ☐ Track status through the manual steps; one-click "mark submitted" (reuse existing handoff).

### 1.7 Autofill V2 — adapter core + browser extension  ◐
_Full plan: `docs/AUTOFILL_V2_PLAN.md`. Decision: server-side Playwright cannot pass
Workday/iCIMS/Taleo login + 2FA + email-verify walls and gets IP-blocked; the durable,
ToS-respecting pattern (per Simplify/Huntr/LoopCV) is a **browser extension that fills
the DOM in the user's authenticated session**, never stores credentials, never
auto-submits. Goal: autofill works on ALL market portals at 100% fill._

**⚠️ PRESERVE THE CURRENT GREENHOUSE FILLER.** The server-side Playwright engine
(`server/services/automation/form-filler.ts`) already achieves ~100% auto-fill on
Greenhouse — it is the **golden reference** and stays live and **untouched**. All V2
work is **additive** (new files + re-export shims). Do NOT delete or rewrite the old
path. Removing it is **1.7c below — gated on Plan B being proven across portals.**

- **1.7a — Adapter core (server-side, additive):**
  - ☐ `shared/autofill/adapter.ts`: `PlatformAdapter` interface + registry; Greenhouse adapter = reference.
  - ☐ Migrate Greenhouse/Lever/Ashby/Workable maps into adapters; `field-maps.ts` re-exports (shim) so the working filler is unchanged — proven by existing tests staying green.
  - ☐ Add adapters for public no-login boards (SmartRecruiters public, Recruitee, Breezy, Teamtailor, Jobvite public).
  - ☐ Coverage report: % fillable per platform.
- **1.7b — Browser extension (MV3) for gated portals + reliable default:**
  - ☐ Scaffold MV3 extension (Vite + React popup + TS content script).
  - ☐ Port the resolution ladder (deterministic label fill → semantic QA → re-loop) to a DOM engine; match the Greenhouse 100% baseline first.
  - ☐ Wire to existing API (`GET …/:id` package, `POST …/answers`, `POST …/mark-applied`); extend package with `adapterId` + `capabilities` (backward-compatible).
  - ☐ Workday adapter (detect tenant, fill by `data-automation-id` + label, advance steps, **hard stop before Submit**); then iCIMS/Taleo/SuccessFactors.
  - ☐ Enforce primary rules in-extension: no credential storage, no auto-login, no auto-submit, sensitive/EEO + low-confidence escalation surfaced in popup.
- **1.7c — Cutover (GATED — do later, only once 1.7b proven across portals):**
  - ☐ Per-portal, decide whether the extension replaces the server-side path.
  - ☐ **Only then** remove the superseded/commented-out server-side code.
- **1.7 verification (each portal, 2–3 real apps):** 100% fillable fields filled;
  no fabricated answers; sensitive/EEO + low-confidence escalated; no credentials
  stored; no auto-submit; resume attached; coverage shows only Submit remaining.
  _Note: login-gated end-to-end runs require the owner's authenticated browser —
  cannot be fully automated in CI._

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

### 2.3 Per-user real-dollar spend limits across paid providers (Apify, Claude, …)  ☐
_(Real-money guardrail layer. Builds on the `token-tracker` + usage service; complements 2.1 volume caps and 2.2 cost visibility.)_
- ☐ Define a unified **cost model**: track real-dollar spend per user for every paid provider — Claude/Anthropic (tokens × model price), Apify (actor/compute units), and any other metered external service — normalized to USD.
- ☐ Attribute cost at the source: route all paid calls through metered wrappers (Claude via `server/services/ai`/`token-tracker`; Apify via its ingestion wrapper) so every call records `{userId, provider, unitsUsed, usdCost, task}`.
- ☐ **Per-user, whole-application limits**: a single configurable USD budget per user that aggregates across all providers (not separate per-provider caps the user has to reason about). Track spend-to-date against it.
- ☐ **Limits must not degrade UX**: enforce gracefully — warn/throttle/queue and surface a clear in-app message as a user nears/hits their cap; never hard-crash a run mid-flight or leave an application in a broken state. Define soft (warn) vs hard (block new work) thresholds.
- ☐ **Admin dashboard — visibility**: per-user spend clearly broken down by provider (Claude / Apify / other) and in total, with budget used vs remaining, trends, and which users are near/over limit. Surfaced prominently for the admin (I).
- ☐ **Admin dashboard — configurability**: admin can set/change the per-user USD budget (global default + per-user override), set soft/hard thresholds, and reset/top-up budgets — all from the admin UI, no redeploy.
- ☐ Provider price config: maintain editable per-model / per-actor USD rates so cost math stays accurate as Apify/Anthropic pricing changes.
- ☐ Alerts: notify admin when a user crosses a threshold or when aggregate spend spikes.
- ☐ Tests: cost attribution accuracy per provider; soft/hard threshold enforcement; graceful-degradation (no broken UX) at the cap.

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
- ☑ 2026-06-17 — **Phase 1**: shortlist diversity (per-company cap); Ashby + Workable
  no-login sources + wider net; 19 shared common application fields; best-practice
  Q&A prompt + much broader grounded question coverage; copy/paste detail sheet +
  per-vendor guidance for hard portals (Workday/iCIMS).
- ☑ 2026-06-17 — **Phase 2**: tier catalog (Free/Starter 30·Pro 50·Max 75 per day)
  with prices + per-day plan cap enforced in the pipeline; dynamic plans on the
  billing page; admin Financials view (MRR/ARR, revenue by tier, AI+infra cost,
  gross margin, ARPU/cost-per-user).
- ☑ 2026-06-17 — **Phase 3**: day-wise Applications view (per-day sections with
  applied/to-review/failed tallies) + List toggle.

### Carried forward (Phase 1–3 sub-items not yet done)
- 1.1 — learn from approve/decline + auto-calibrate threshold; labeled quality eval.
- 1.3 — onboarding UI to capture the full set of fields the data model now supports.
- 1.5 — per-portal guided step-by-step UI; decision on (no-)credential storage.
- 2.1 — plan upgrade/downgrade + Stripe proration; cap-enforcement tests per tier.
- 2.2 — billing charts/date-range/per-user drill-down; admin-only access control.
- 3.1 — per-application status timeline; dashboard empty/loading/error-state pass.
