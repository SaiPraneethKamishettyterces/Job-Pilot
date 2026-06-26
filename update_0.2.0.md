# Update 0.2.0 — Manual apply flow + Admin Claude cost dashboard

**Date:** 2026-06-25
**Branch:** `feat/claude-cost-dashboard-and-apply-flow`
**Diff:** 26 files changed, +2214 / −451
**Scope:** Two large workstreams — (1) replace the implicit "auto-apply" behavior
with an explicit, confirm-gated manual apply flow, and (2) add an owner-facing
**Claude API Cost** admin dashboard with live tracking, per-factor measurement,
margin analysis, and bill reconciliation.

> Context: the app no longer silently fills the Applied tab. A job moves to Applied
> **only** when the user clicks Apply and confirms "yes, I applied". Documents are
> generated per-job on demand (not bulk during ingestion).

---

## 1. Apply flow — manual, confirm-gated

**Problem:** every shortlisted job showed up under *Applied* even though the user
never applied. Root cause: the auto-apply pipeline created `Application` rows during
ingestion, and the Applied page rendered **all** applications regardless of status.

**Fix — `appliedAt` is the single source of truth.** A job is "applied" only after
`mark-applied` sets `appliedAt`. Pipeline-prepared apps have `appliedAt = null`.

New apply sequence (Jobs Found → posting → confirm):

| Step | What happens | Code |
|------|--------------|------|
| 1. Click **Apply** | per-card button (or detail panel) | `jobs.tsx` `handleApply` |
| 2. Popup 1 — extension | "Add Chrome extension / Do it later" — **every 10th apply**, only if not installed | `jobs.tsx` |
| 3. Check existing | reuse already-generated docs instead of re-asking | `GET /api/jobs/:id/application` |
| 4. Popup 2 — documents | "Generate documents / Do it later" | `jobs.tsx` |
| 5. Generating | spinner; resume + cover letter + cold email **for that job** | `generateDocsThen` |
| 6. Popup 3 — ready | per-doc **Download** + **Continue to apply** | `jobs.tsx` |
| 7. Open posting | opens on the Continue click (user gesture → no popup-block, no blank page) | `openPosting` |
| 8. Return → confirm | "Did you apply?" → **Yes** → `mark-applied` → APPLIED | `appliedMutation` |

- New backend `POST /api/jobs/:id/apply` — finds-or-creates **one** `Application`
  linked to the real matched job (dedups; no more disconnected jobs from
  `/from-url` re-parsing). `server/routes/jobs.ts`
- New backend `GET /api/jobs/:id/application` — read-only existing app + docs, so
  re-applying reuses instead of regenerating. `server/routes/jobs.ts`
- Applied jobs are **excluded from Jobs Found** (`findMatches` filters out jobs with
  an APPLIED application) — they actually "move". `server/repositories/job-repository.ts`
- Old doc-prep `ApplyModal` removed; the streamlined flow replaces it. `jobs.tsx`

---

## 2. Ingestion folded onto the dashboard — `/runs` deleted

- `Start a Run` on the dashboard now triggers ingestion **inline** (subscriber →
  run immediately; non-subscriber → popup: Subscribe → `/billing`, or run a test
  ingestion right there). `src/components/ingestion/ingestion.tsx`
- Live **`ActiveRunBanner`** — stage-based progress bar (Discovering → Parsing →
  Scoring → Done) + live found/added/duplicate counts; on completion refreshes the
  Jobs list. Shown on dashboard + Jobs Found.
- **Run history** moved onto the dashboard.
- `/runs` page **deleted**; route redirects to `/dashboard`; nav + header title
  cleaned up. `src/App.tsx`, `AdminShell.tsx`, `header.tsx`, **deleted** `runs.tsx`

---

## 3. Jobs Found — sort + fetched time

- **Sort dropdown**: Newest fetched · Oldest fetched · Best match (`matchedAt`).
- **"Fetched X ago"** shown per card alongside "Posted X ago".
- Live re-fetch every 3 s while an ingestion run is active. `jobs.tsx`

---

## 4. Per-job document generation — latency + mapping

- **Pipeline no longer bulk-generates docs.** During a run it only *shortlists*;
  documents are generated per-job when the user applies. Gated by
  `PIPELINE_AUTOGEN_DOCS` (default **off**). `server/workers/application-pipeline.ts`,
  `server/lib/config.ts`
- **Latency fix:** the 3 AI calls (resume on Claude, cover + cold on local) ran
  **sequentially** (~65 s). Now run **concurrently** (~35–40 s ≈ the Claude resume
  call alone). Same prompts/models → identical quality.
  `server/services/application/application-generator.ts`
- **Dedup:** regenerating no longer creates duplicate `ApplicationDocument` rows
  (`replaceDoc` deletes-before-insert per type).

---

## 5. Admin "Claude API Cost" dashboard (new)

New admin page `src/admin/pages/claude-usage.tsx` (route `/claude-usage`), backed by
`GET /api/admin/claude-usage` in `server/routes/admin.ts`. Claude clay-orange theme
on the dark console; **live, auto-refreshes every 10 s**.

| Panel | What it shows |
|-------|---------------|
| Hero tiles | cost/resume, **margin/resume vs plan revenue** (red = loss), Claude routing rate, month-to-date vs budget |
| Reconcile (optional) | import Anthropic billing CSV → **true billed total** + per-key gap |
| Margin per application | revenue/app vs Claude resume cost, per plan, color-coded |
| Budget & alerts | editable monthly budget + cost/resume threshold (persisted) |
| Cost optimization | data-driven tips (caching inactive, output length) with est. savings |
| Routing strip | one-row pipeline; only resume tailoring is Claude (rest local = $0) |
| What drives the cost | **clickable** Input/Output bars → measured factor drill-down |
| Daily spend | per-day bars ($/day ↔ calls/day toggle) — not cumulative |
| Spend per user | bar + table, top 20 |
| Per-feature table | friendly labels, provider color, tokens, totals |
| Recent calls | sortable, filterable (status/min-cost), CSV export, joined to job+status |

**Key business insight surfaced:** a Claude resume (~$0.092) costs more than the
per-application revenue on every plan (Starter −$0.044, Pro −$0.033, Max −$0.026);
only profitable *blended* because ~86% of resumes fall back to the free local model.

---

## 6. Measured cost-factor tracking (new system)

To replace the earlier *modeled* section estimate with real data:

- New column **`AIUsageEvent.breakdownJson`** (`prisma/schema.prisma`).
- At tailor time, each call records its **actual token split** — input components
  (ATS skill prompt, base resume, job description, instructions) and output sections
  (summary, skills, experience, education, ATS analysis) — sized by real content and
  apportioned to the billed totals. `server/services/resume/tailor-service.ts`,
  `server/services/ai/usage-recorder.ts`
- Dashboard aggregates these into the clickable Input/Output drill-down.
- Finding: **ATS skill prompt = ~99% of input cost; ATS analysis = ~66% of output.**

---

## 7. Cost reconciliation (tracked vs billed)

- The app tracks only its own API key. Anthropic's bill includes other keys.
- `POST /api/admin/claude-usage/reconcile` parses the Anthropic billing CSV (prices
  each row incl. cache write/read multipliers) → stores actual billed total + per-key
  breakdown. `server/routes/admin.ts`
- Verified: CSV total **$2.6223** == Claude console; gap = the `resume parsing`
  key ($0.25) the app never tracked.

---

## 8. Dashboard / stats corrections

- `weeklyTotal` now counts **APPLIED this week** (was: all apps created). `stats.ts`
- Applied page exposes **posted date** (`Application.postedAt`). `applications.ts`,
  `types/index.ts`, `applied.tsx`
- `ExtensionConnect` bridges its detection state to the install flag the apply flow
  reads + a "Mark installed (testing)" affordance. `extension-connect.tsx`

---

## 9. Config / schema

| Change | File |
|--------|------|
| `PIPELINE_AUTOGEN_DOCS` (default false) | `server/lib/config.ts` |
| `claudeMonthlyBudgetUsd`, `claudeCostPerResumeWarnUsd` runtime settings | `runtime-settings.ts` |
| `AIUsageEvent.breakdownJson Json?` | `prisma/schema.prisma` |
| `Application.postedAt` exposed in API | `applications.ts` |

> ⚠️ **Migration note:** `breakdownJson` was applied to the local DB via raw
> `ALTER TABLE`. `schema.prisma` is committed but **no migration file exists** — run
> `prisma migrate dev` (or `db push`) on a fresh clone/deploy to create the column.

---

## 10. Files changed (26)

**Backend (12):** `prisma/schema.prisma`, `server/lib/config.ts`,
`server/repositories/job-repository.ts`, `server/routes/admin.ts`,
`server/routes/applications.ts`, `server/routes/jobs.ts`, `server/routes/stats.ts`,
`server/services/admin/runtime-settings.ts`, `server/services/ai/usage-recorder.ts`,
`server/services/application/application-generator.ts`,
`server/services/resume/tailor-service.ts`, `server/workers/application-pipeline.ts`

**Frontend (13):** `src/App.tsx`, `src/admin/App.tsx`,
`src/admin/components/AdminShell.tsx`, `src/admin/pages/claude-usage.tsx` (new),
`src/components/extension-connect.tsx`, `src/components/ingestion/ingestion.tsx` (new),
`src/components/layout/header.tsx`, `src/pages/applied/applied.tsx`,
`src/pages/dashboard/dashboard.tsx`, `src/pages/jobs/jobs.tsx`,
`src/services/api/admin.ts`, `src/services/api/jobs.ts`, `src/types/index.ts`

**Deleted (1):** `src/pages/runs/runs.tsx`
</content>
