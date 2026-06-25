# JobPilot — Production-Readiness Audit & Execution Plan

_Generated 2026-06-23 from full source inspection (UI, backend, data/arch, AI, tests/CI)._

## 1. Verdict

**Overall: ~55% production-ready.** The architecture is sound and the happy path works end-to-end (verified: 7,329 postings ingested, matched, 20 applications prepared). It is **not** launchable yet — blocking security holes, data-integrity gaps, no cost caps on AI spend, single-instance-only workers, and ~15% test coverage.

| Dimension | Score | One-line state |
|---|---|---|
| UI / UX | 65% | Core flows work & look good; placeholder features + a11y gaps |
| Backend / API | 60% | Structurally clean; per-user scoping good; a few blocking holes |
| Security | 45% | JWT default-secret fallback, path traversal, no Helmet, no cost caps |
| Data / Architecture | 55% | Coherent lifecycle; integrity (no txns) + scale (BYTEA, NOT IN) gaps |
| AI / ML | 60% | Dual-provider works; no retries/timeouts/cost caps/injection guard |
| Testing / CI | 20% | ~15% coverage; CI gates run **after** merge, tests not blocking |

**Definition of done for "production-ready":** all Critical + High issues closed, test coverage ≥60% on critical paths, CI gating PRs, external scheduler + GCS artifact backend live, observability wired.

## 2. Parallel workstream model (conflict-free)

Two streams, split by **file/directory ownership** so simultaneous commits don't collide.

### Stream A — Platform, Security, Data & Infra  → **Collaborator 1 (you, SaiPraneethKamishettyterces)**
Owns: `server/lib/`, `server/middleware/`, `server/routes/{auth,billing,files,ingestion,subscription,account,stats,profile}.ts`, `server/index.ts`, `server/workers/`, `server/repositories/`, `prisma/` **(sole migration author)**, `shared/validation.ts`, `.github/`, `Dockerfile`, `cloudbuild.yaml`.

### Stream B — Product, AI & UI  → **Collaborator 2 (sainithin761000)**
Owns: `src/` (all frontend), `server/services/{ai,matching,application,resume,ingestion}/`, `server/routes/{claude,jobs,applications-business-logic}.ts`, all `*.test.ts` for AI/pipeline/UI.

### Hard rules to avoid clobbering
1. **`main` is protected.** All work via feature branch → PR → CI green → review → squash-merge. No direct pushes.
2. **CODEOWNERS** enforces the two trees above (auto-request review from the owner).
3. **One owner per file.** If a fix needs a file the other owns, comment on their issue — don't edit it.
4. **Only Stream A authors Prisma migrations** (migration filenames are sequential — two authors = guaranteed conflict). Stream B requests schema changes via an issue.
5. **Route handler files = Stream A; service + `src/` + test files = Stream B.** Stream B adds tests in new `*.test.ts` files, never edits A's handlers.
6. Rebase on `main` before opening a PR; keep PRs small (one issue each).

## 3. Sequenced issues

Execute by wave. Within a wave, A and B run in parallel. Each issue: Module · Problem · Acceptance · Priority · Assignee · Deps.

---

### WAVE 0 — Foundation (do first, together; unblocks safe parallel work)

#### #1 — Land merged work on `main` + adopt PR workflow + CODEOWNERS
- **Module:** repo / git
- **Problem:** Collaborator's update sits on branch `fix/lint-unused-signals`, not `main`; no branch protection or ownership map → high clobber risk once both start.
- **Acceptance:** WIP committed; PR merged to `main`; branch protection on (require PR + CI + 1 review); `.github/CODEOWNERS` maps Stream A/B trees; both clones rebased on `main`.
- **Priority:** Critical · **Assignee:** A · **Deps:** none

#### #2 — CI gates on `pull_request` (lint + typecheck + test) with Postgres+pgvector
- **Module:** `.github/workflows/`
- **Problem:** Deploy workflow runs on `push` to `main` — gates fire **after** merge; failing tests don't block; integration tests never run (no DB in CI).
- **Acceptance:** New `test.yml` on `pull_request` runs `lint`, `typecheck`, `test`, and `test:integration` against a `pgvector/pgvector:pg17` service container; any failure blocks merge; deploy workflow assumes green.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #3 — `docker-compose` for pgvector dev DB + README
- **Module:** repo / dev env
- **Problem:** Local DB = ad-hoc Docker container on :5433 with repointed `DATABASE_URL`; tribal knowledge, not reproducible.
- **Acceptance:** `docker-compose.yml` (pgvector/pgvector:pg17, named volume) + README "Local setup" section; `.env.example` notes the :5433 URL; `npm run db:migrate && npm run seed:sources` documented.
- **Priority:** High · **Assignee:** A · **Deps:** #1

---

### WAVE 1 — Blocking (must fix before any launch)

#### #4 — Require `JWT_SECRET`, remove hardcoded fallback
- **Module:** `server/lib/config.ts:64`
- **Problem:** `optional("JWT_SECRET","dev-secret-change-in-production")` — absent secret signs tokens with a public string; anyone with source can forge any user's token.
- **Acceptance:** `required("JWT_SECRET")`; boot fails if missing; min-length (≥32) guard; dev `.env` documents it.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #5 — Admin-gate `POST /api/ingestion/global`
- **Module:** `server/routes/ingestion.ts:64`
- **Problem:** Any authenticated user can trigger global ingest → burns paid Apify/aggregator budget. Admin route already gates the same op.
- **Acceptance:** Route requires `requireAdmin` (or removed in favor of `/api/admin`); non-admin → 403; test covers it.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #6 — Fix file-download path traversal + ownership re-check
- **Module:** `server/routes/files.ts:27`
- **Problem:** Key derived from `req.path` without normalization; `../` can escape the user's segment; ownership check only validates first segment → cross-user artifact access.
- **Acceptance:** Reject/normalize keys containing `..`; assert key starts with `applications/${req.userId}/`; `Content-Disposition` filename sanitized; tests for traversal + cross-user 403.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #7 — Enum-validate Application status PATCH
- **Module:** `shared/validation.ts:170`, `server/routes/applications.ts`
- **Problem:** `status: z.string().optional()` — any arbitrary string is written to DB.
- **Acceptance:** `z.enum([...valid statuses])`; invalid → 400; allowed transitions documented.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #8 — Add Helmet security headers
- **Module:** `server/index.ts`, `package.json`
- **Problem:** No `X-Content-Type-Options`/`X-Frame-Options`/CSP/HSTS while serving the SPA.
- **Acceptance:** `helmet` installed + `app.use(helmet())` before static; CSP allows the app's own assets; verified via response headers.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #9 — Pin CORS; fail on wildcard in prod
- **Module:** `server/index.ts:39`, `server/lib/config.ts:269`
- **Problem:** `UI_ORIGIN=*` reflects every Origin.
- **Acceptance:** Remove wildcard short-circuit; prod boot fails if `UI_ORIGIN` is `*` or unset; allowed origins explicit.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #10 — Fix `workAuthorization = sponsorshipNotes` copy bug
- **Module:** `server/repositories/job-posting-repository.ts:47`
- **Problem:** Upsert writes `sponsorshipNotes` into the `workAuthorization` column for every row — column permanently corrupted.
- **Acceptance:** Line maps `n.workAuthorization`; backfill/re-ingest note added; unit test asserts correct mapping.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #11 — Guard `expireStalePostings(retentionDays <= 0)`
- **Module:** `server/repositories/job-posting-repository.ts:229`
- **Problem:** `retentionDays = 0` expires the **entire** pool every cycle (guard is `< 0`).
- **Acceptance:** Guard `<= 0` returns 0; test for 0 and negative.
- **Priority:** Critical · **Assignee:** A · **Deps:** #1

#### #12 — Per-user AI cost caps (402 when exceeded)
- **Module:** `server/routes/claude.ts`, `server/services/usage/`
- **Problem:** No spend cap; 60 req/hr × max_tokens can run ~$90+/hr per account.
- **Acceptance:** Configurable daily/monthly USD cap per user; pre-call check sums `AIUsageEvent` cost in window; over-cap → 402; tested.
- **Priority:** Critical · **Assignee:** B · **Deps:** #1

#### #13 — AI retries + timeouts
- **Module:** `server/services/ai/openai-provider.ts`, `ai-service.ts`
- **Problem:** No retry/backoff; no `AbortSignal` timeout — one transient 429/5xx/timeout fails the user request.
- **Acceptance:** Exponential backoff (3 tries) on 429/502/503/timeout; `AbortSignal.timeout(30s)` on all model fetches; unit tests with mocked failures.
- **Priority:** Critical · **Assignee:** B · **Deps:** #1

#### #14 — Robust JSON extraction + schema validation
- **Module:** `server/services/ai/ai-service.ts:53`
- **Problem:** Greedy `/\{[\s\S]*\}/`, no max-length guard, `JSON.parse(...) as T` with no validation → brittle, ReDoS-prone.
- **Acceptance:** Bounded, non-greedy extraction; Zod-validate every parsed payload; malformed → typed error; tests for prose-wrapped / truncated / multi-object output.
- **Priority:** Critical · **Assignee:** B · **Deps:** #1

#### #15 — Frontend 401/403 → redirect to login
- **Module:** `src/lib/auth.tsx`, API client
- **Problem:** Expired/invalid tokens only toast; users stuck on stale/blank UI.
- **Acceptance:** Response interceptor clears session + redirects to `/login` on 401/403 (preserving return URL); logged-in users hitting `/login` redirect to `/dashboard`.
- **Priority:** Critical · **Assignee:** B · **Deps:** #1

#### #16 — Resolve placeholder UI (notifications, global search, analytics)
- **Module:** `src/components/layout/header.tsx`, `src/pages/analytics/analytics.tsx`
- **Problem:** Notification bell (no-op), global search (no `onChange`), analytics page (hardcoded mock) read as broken/incomplete.
- **Acceptance:** Each either implemented or hidden behind a feature flag/removed; no dead interactive controls ship.
- **Priority:** Critical · **Assignee:** B · **Deps:** #1

---

### WAVE 2 — High (production-hardening)

#### #17 — Atomic `Job` + `JobMatch` upsert (transaction)
- **Module:** `server/services/matching/rerank.ts:101-152`
- **Problem:** Two sequential upserts; crash between them orphans a `Job` that blocks its `(userId,postingId)` slot forever. (No `$transaction` anywhere in `server/`.)
- **Acceptance:** Wrap in interactive `prisma.$transaction`; integration test simulates failure between writes → no orphan.
- **Priority:** High · **Assignee:** B · **Deps:** #1

#### #18 — Global application idempotency
- **Module:** `server/workers/application-pipeline.ts:93`, `prisma/schema.prisma`
- **Problem:** Dup-check scoped to `(userId,jobId,runId)`; recovery uses a new `runId` → can duplicate applications.
- **Acceptance:** Check on `(userId,jobId)` across runs; `@@unique([userId, jobId])` (migration by A); test for recovery path.
- **Priority:** High · **Assignee:** A (migration) + B (logic) · **Deps:** #1

#### #19 — Missing DB indexes
- **Module:** `prisma/schema.prisma` + migration
- **Problem:** No index on `ApplicationEvent.applicationId`, `JobMatch(userId,score)`, `JobPosting.embeddedAt`, event `createdAt`, FK-only tables.
- **Acceptance:** Indexes added via migration; `EXPLAIN` confirms index use on the hot queries.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #20 — Status/type freetext → enums/CHECK
- **Module:** `prisma/schema.prisma` (`postingStatus`, `remoteType`, `employmentType`, `seniority`, `GlobalIngestRun.status`)
- **Problem:** Untyped TEXT on the primary filter columns; a typo silently drops rows.
- **Acceptance:** Postgres enums (or CHECK) + code uses the enum; migration backfills existing values.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #21 — `NOT IN (excludePostingIds)` → `NOT EXISTS`
- **Module:** `server/repositories/job-posting-repository.ts:165`
- **Problem:** Clause grows linearly with user history; degrades to seq-scan past ~500 applications.
- **Acceptance:** Index-friendly `NOT EXISTS` correlated subquery; equivalent results test; query plan verified.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #22 — Embed the full pool
- **Module:** `server/services/ingestion/embed-postings.ts:26`
- **Problem:** Cap of 1000/run; only 1,000 of 7,329 embedded → vector matching sees a fraction.
- **Acceptance:** Loop until `embedded===0` (or config cap); `embedding IS NOT NULL` covers the live pool; config value exposed; alert when `pending>0 && embedded==0`.
- **Priority:** High · **Assignee:** B · **Deps:** #1

#### #23 — External scheduler + worker concurrency guards
- **Module:** `server/workers/daily-scheduler.ts`, `server/services/ingestion/global-ingestor.ts`
- **Problem:** In-process `setInterval` + per-process guards double-fire under Cloud Run scale; ingestor has no overlap lock.
- **Acceptance:** Cloud Scheduler → single-consumer endpoint; `INSERT…WHERE NOT EXISTS` / advisory lock for per-user daily run; ingestor takes an advisory lock; min-instances>1 safe.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #24 — GCS artifact backend + event/artifact retention
- **Module:** `server/services/storage/artifact-storage.ts`, retention job
- **Problem:** All docs as Postgres BYTEA (~1GB/day @1k users, no cleanup, full-buffer reads); `ApplicationEvent`/`AIUsageEvent` grow unbounded.
- **Acceptance:** GCS implementation behind existing `putArtifact/getArtifact`; prod uses GCS, dev keeps Postgres; purge job for events + expired artifacts (>90d); streamed downloads.
- **Priority:** High · **Assignee:** A · **Deps:** #1, #3

#### #25 — `billing/users` memory/N+1 fix
- **Module:** `server/routes/billing.ts:232`
- **Problem:** Loads every `AIUsageEvent` for every user into Node memory before aggregating → OOM at scale.
- **Acceptance:** DB-side `groupBy` aggregation + user pagination; load test at 1k users stays bounded.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #26 — List-endpoint pagination + limit clamping
- **Module:** `server/routes/{applications,jobs}.ts`, `server/repositories/job-repository.ts`
- **Problem:** `/api/jobs` unbounded; `/api/applications` `limit` unclamped (`limit=999999` → full scan).
- **Acceptance:** Clamp `1..200`, default 50; cursor/offset pagination; tests.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #27 — Boot-time AI key validation (fail-fast)
- **Module:** `server/index.ts`, `server/services/ai/client.ts`
- **Problem:** Lazy init; bad/missing key surfaces only on first request as a 500.
- **Acceptance:** On boot, check configured providers; warn for optional, refuse to start in prod if a required provider key is missing.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #28 — Wire real error sink + request correlation id
- **Module:** `server/lib/error-reporter.ts`, `server/middleware/request-logger.ts`
- **Problem:** `captureException` only logs to pino; no correlation id to join access + error logs.
- **Acceptance:** Sentry/GCP Error Reporting wired; per-request `x-request-id` (or Cloud-Trace) attached to every log line.
- **Priority:** High · **Assignee:** A · **Deps:** #1

#### #29 — Prompt-injection hardening
- **Module:** `server/services/ai/prompts.ts`
- **Problem:** User/ingested JD concatenated raw into prompts ("ignore previous instructions" risk).
- **Acceptance:** Untrusted input clearly delimited + instruction-neutralized; length-bounded; adversarial test (JD trying to inflate resume claims) fails to alter output.
- **Priority:** High · **Assignee:** B · **Deps:** #14

#### #30 — Graceful AI-unavailable degradation in pipeline
- **Module:** `server/services/application/{application-generator,outreach}.ts`, `tailor-service.ts`
- **Problem:** Missing-resume still proceeds toward APPROVED; cover/cold-email return null; untailored fallback not surfaced.
- **Acceptance:** Missing resume on a resume-required ATS → user-review status, not auto-approve; template fallbacks for letters; fallback/untailored docs flagged (`usedAi:false`) and badged in UI.
- **Priority:** High · **Assignee:** B · **Deps:** #1

#### #31 — Test critical paths (pipeline, AI routes, matching)
- **Module:** `*.test.ts` (new)
- **Problem:** ~0% on routes + application pipeline; matching scorer untested.
- **Acceptance:** Integration tests for `application-generator` (full pipeline), `/api/claude/*`, `/api/applications` (authz/pagination/transitions), `match-scorer` (thresholds, no-AI fallback); critical-path coverage ≥60%; runs in CI (#2).
- **Priority:** High · **Assignee:** B · **Deps:** #2

#### #32 — Onboarding validation + require resume
- **Module:** `src/pages/onboarding/onboarding.tsx`
- **Problem:** Steps advance without validation; user reaches dashboard with no resume.
- **Acceptance:** `canProceed()` per step; required fields enforced; resume required before finish; server-side errors mapped to fields.
- **Priority:** High · **Assignee:** B · **Deps:** #1

#### #33 — Wire/clean dead Settings + Contact controls
- **Module:** `src/pages/settings/settings.tsx`, `src/pages/contact/contact.tsx`
- **Problem:** Account-name "Save" is a no-op; digest/reminder toggles don't persist; contact form `catch {}` shows success even on failure.
- **Acceptance:** Each control wired to a real mutation or removed; contact form only shows success on 2xx.
- **Priority:** High · **Assignee:** B · **Deps:** #1

#### #34 — Accessibility pass
- **Module:** `src/components/layout/*`, `src/pages/*`
- **Problem:** Icon buttons unlabeled; nav lacks `aria-current`; global search unlabeled; list rows not keyboard-operable; weak focus rings.
- **Acceptance:** `aria-label` on all icon-only buttons; `aria-current="page"` on active nav; labeled search; `onKeyDown` on clickable rows; visible focus-visible rings; axe clean on key pages.
- **Priority:** High · **Assignee:** B · **Deps:** #1

#### #35 — Responsive + state-bug pass
- **Module:** `src/pages/{applications,review,dashboard,jobs}/*`, `src/components/layout/header.tsx`
- **Problem:** Applications table overflows mobile; review doesn't stack; `applications` day-grouping `useMemo` misses `statusFilter`/`search` deps; rescore double-click; empty-queue infinite spinner; per-section error states missing.
- **Acceptance:** Tables scroll/stack on mobile; correct `useMemo` deps; debounced/disabled rescore; empty + error states per data section.
- **Priority:** High · **Assignee:** B · **Deps:** #1

---

### WAVE 3 — Medium (polish & defense-in-depth)

#### #36 — Supply-chain & Docker hardening in CI
- **Module:** `.github/workflows/`, `Dockerfile`
- **Problem:** No `npm audit`/Trivy/Dependabot; Node base unpinned to patch; runtime image not slimmed.
- **Acceptance:** `npm audit` (fail high/critical) + Trivy image scan + Dependabot on; `node:22.x.y-slim` pinned; multistage copies only `dist/` + prod deps.
- **Priority:** Medium · **Assignee:** A · **Deps:** #2

#### #37 — Auth hardening: bcrypt config, JWT expiry/revocation, action-token isolation
- **Module:** `server/routes/auth.ts`, `server/lib/{config,tokens,auth-middleware}.ts`
- **Problem:** bcrypt rounds hardcoded (config dead); 7-day JWT, no revocation; action tokens share session secret.
- **Acceptance:** Rounds from config (min 10); shorten session token + refresh or `jti` blocklist; separate action-token secret or `purpose` rejection in `requireAuth`.
- **Priority:** Medium · **Assignee:** A · **Deps:** #4

#### #38 — Misc backend hardening
- **Module:** `server/routes/{claude,resumes,subscription}.ts`, `db.ts`, `request-logger.ts`
- **Problem:** `count-tokens` payload unvalidated; resume upload under `process.cwd()`; dev `activate` single-guard; query strings (PII) logged; slow-query reads `process.env` directly.
- **Acceptance:** Validate count-tokens (bounded); upload to `os.tmpdir()`; activate also asserts `!hasStripe()`; log `req.path` only; slow-query via config.
- **Priority:** Medium · **Assignee:** A · **Deps:** #1

#### #39 — dedupeKey fallback + dead-board deactivation + HNSW tuning
- **Module:** `server/services/ingestion/{job-normalizer,registry}.ts`, embedding migration
- **Problem:** Empty `sourceJobId` → key collisions silently drop postings; boards that succeed once then 404 stay active forever; HNSW uses defaults.
- **Acceptance:** Hash-based fallback key when `sourceJobId` empty; consecutive-failure counter deactivates dead boards; HNSW `m=32, ef_construction=128` + `ef_search` set.
- **Priority:** Medium · **Assignee:** A (B reviews ingestion logic) · **Deps:** #1

#### #40 — UI consistency + token-storage CSP note
- **Module:** `src/components/ui/*`, `src/pages/activity/activity.tsx`, `src/lib/auth.tsx`
- **Problem:** Inconsistent badge/button usage; unaudited dark-mode colors; activity labels ad-hoc; token in `localStorage` (XSS exposure).
- **Acceptance:** Badge/button usage normalized; dark-mode contrast audited (WCAG AA); activity type→label map; CSP (from #8) documented as the localStorage-XSS mitigation, or migrate to httpOnly cookie (tracked).
- **Priority:** Medium · **Assignee:** B · **Deps:** #8

---

## 4. Execution order (TL;DR)
Wave 0 (#1–#3) → Wave 1 blocking (#4–#16, A and B parallel) → Wave 2 hardening (#17–#35) → Wave 3 polish (#36–#40).
Ship gate: all Critical + High closed, critical-path coverage ≥60%, CI gating PRs, external scheduler + GCS live, error sink wired.
