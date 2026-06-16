# Merge Analysis — Job_applying_agent → Job-Pilot

> Goal: unify both repos into **Job-Pilot** as the single production codebase for the automated job-application platform. This document is the pre-merge analysis: it captures each repo's workflow, the overlap, the gaps, and the merge plan.

---

## 1. Job_applying_agent (Python engine)

**What it solves.** A human-in-the-loop application *preparation* engine. It reads pending jobs + a candidate profile from BigQuery, tailors an ATS-safe resume with Claude, builds a pre-filled "application package" (standard fields + selectors + warnings), stores artifacts in GCS, and flips the job to `READY_FOR_USER`. **The engine never submits, never solves CAPTCHAs** — a browser extension/user does the final submit. This is a deliberate safety model.

**Entry points.** `main.py` CLI — `scan` (production: prepare all today's pending jobs), `prepare-one` (single job debug), `tailor` (standalone resume tailoring, no BigQuery). Orchestrator: `prepare/preparation_runner.py::run_scan()`.

**Folder structure & core services.**
| Module | Role |
|---|---|
| `bq/` | BigQuery persistence — `JobRepository` (status transitions: PENDING→IN_PROGRESS→READY_FOR_USER/FAILED/UNSUPPORTED), `UserDetailsRepository` (profile), parameterized queries + retries |
| `models/` | Pydantic models — `Job`, `UserDetails`, `ApplicationPackage` + `StandardField` + `ResumeRef`, `ApplicationResult` |
| `prepare/` | Product orchestrators (no browser) — `PreparationRunner`, `ApplicationPackager` |
| `resume/` | `ResumeTailor.tailor()` (the single tailoring chokepoint), `tailoring_models.py`, `resume_storage.py` |
| `llm/` | `LLMClient` (Anthropic wrapper, graceful degradation), `QuestionAnswerer` (custom→profile→AI→escalate with sensitivity gates), `skill_loader.py`, `prompts.py` |
| `apply/` | **Legacy QA only (not in product flow):** `detect_platform`, `field_maps.py` (declarative selectors), `form_utils.py` (Playwright), `BaseHandler`/`GreenhouseHandler`/`LeverHandler` |
| `storage/` | `StorageClient` — GCS upload, 1h signed URLs, JSON packages, local-disk fallback |
| `observability/` | JSON structured logger, screenshot logger |
| `skills/ats-resume-tailoring/` | **High-value reusable Claude Skill** — SKILL.md + reference rules + JSON schema + `render_resume.py` (deterministic JSON→DOCX/PDF/MD/TXT, ATS-safe typography) |
| `manual_test/` | QA harness (visible browser, fill + human handoff) |
| `tests/` | platform detector, question answerer, packager, renderer, skill routing, status updates |

**External deps/APIs.** Anthropic (`claude-haiku-4-5` default), Google BigQuery, Google Cloud Storage, Playwright, python-docx, reportlab, pydantic, tenacity.

**Must preserve (genuinely unique value):**
1. **`skills/ats-resume-tailoring/`** — the truthfulness-constrained tailoring rules + deterministic renderer. This is the crown jewel and is provider/language-agnostic.
2. **Resume tailoring chokepoint logic** — load skill → Claude JSON → validate → force-apply verified personal info → render.
3. **QuestionAnswerer resolution order** — exact/fuzzy custom answers → profile regex → AI (generic only) → escalate; sensitivity gates (visa, salary, demographics).
4. **ApplicationPackage contract** — `StandardField{key,label,value,required,selectors[]}` + `ResumeRef{signed url}` + warnings. This is the extension-facing data shape.
5. **Declarative field maps** — Greenhouse/Lever selectors (multi-variant for classic + new UI).
6. **Status-transition try/finally guard** — never leave a job stuck IN_PROGRESS.

---

## 2. Job-Pilot (TypeScript platform — BASE)

**What it solves.** Full-stack AI job-application platform: parse resume → discover jobs (ATS APIs) → score match → (intended) generate documents → track applications, with approval modes and per-call AI cost tracking.

**Stack.** React 19 + Vite (UI) · Express 5 (BFF) · Prisma/PostgreSQL · `@anthropic-ai/sdk`. Separate admin Vite build. Deploys to Cloud Run via Dockerfile + cloudbuild + GitHub Actions; Terraform in `infra/`.

**Entry points.** `server/index.ts` (API, port 3001/8080), `src/main.tsx`→`App.tsx` (UI), `src/admin/App.tsx` (billing admin). Scripts: `dev`, `build`, `start`, `test` (vitest).

**Backend.** `server/routes/` — auth, resumes (`/upload-parse`), onboarding, runs, jobs, applications, profile, claude (`/apply` SSE cover letter, `/count-tokens`), ingestion, billing, subscription, stats. `server/services/` — `ai/` (ai-service, client, model-config, prompts, token-tracker), `ingestion/` (orchestrator, `ats-sources.ts` = Greenhouse+Lever fetchers, job-normalizer), `job-discovery/job-parser`, `matching/match-scorer`, `profile/`, `billing/`. `server/repositories/`, `server/middleware/`, `server/lib/`.

**Database (Prisma, ~20 models).** User, UserProfile, UserPreference (approvalMode enum, matchThreshold), Resume + ResumeVersion, JobSource, **Job** (full ATS provenance + normalized fields + dedupeKey), JobMatch (score/decision/reasons), ApplicationRun (status state machine), **Application** (lifecycle status enum) + ApplicationDocument + ApplicationAnswer + RecruiterContact + ApplicationEvent, AIUsageEvent, Plan/Subscription/SubscriptionEvent. **No BigQuery** — governance (CLAUDE.md) explicitly forbids it in this app-tier repo.

**AI.** Anthropic only, centralized in `server/services/ai`. Models: opus-4-8 (cover letter), sonnet-4-6 (resume parse), haiku-4-5 (job parse, scoring). Per-call token+cost tracking → AIUsageEvent.

**Already implemented:** resume parse, job discovery (Greenhouse/Lever), match scoring, application tracking, approval queue UI, cost tracking, auth, subscriptions.

**Missing (per its own roadmap):** resume *tailoring* (only parsing exists), Q&A answer generation, cold-email generation, recruiter extraction, **browser automation / form submission**, async worker queue. `server/workers/` is referenced in CLAUDE.md but absent.

---

## 3. Overlap & conflicts

| Concern | Job_applying_agent | Job-Pilot | Resolution |
|---|---|---|---|
| ATS sources (Greenhouse/Lever) | `apply/field_maps` (form selectors) | `ingestion/ats-sources.ts` (job JSON fetch) | **Complementary**, not duplicate — Pilot *discovers*, agent *fills*. Keep both; agent's selectors become extension/automation field maps. |
| Platform detection | `detect_platform()` | `atsPlatform` on Job | Port detection into a TS util used by automation. |
| Resume parsing | (none — assumes profile exists) | `/resumes/upload-parse` | Keep Pilot's. |
| Resume tailoring | `ResumeTailor` + skill | **missing** | **Port** — the gap. |
| Question answering | `QuestionAnswerer` | **missing** | **Port** — the gap. |
| Match scoring | (none) | `match-scorer.ts` | Keep Pilot's. |
| LLM client | `llm/llm_client.py` | `services/ai/*` | Keep Pilot's; route ported logic through it. |
| Persistence | BigQuery per-user tables | Prisma/Postgres | **Map to Prisma** (governance forbids BQ here). `ApplicationPackage`→`ApplicationDocument`; status enums already richer in Pilot. |
| Storage | GCS + signed URLs | GCS planned (infra ready) | Reuse infra `storage` module; add a TS storage client. |
| Models | Pydantic | Prisma + Zod | Prisma is source of truth; add Zod for the package contract. |
| Resume rendering | `render_resume.py` (Python, docx/reportlab) | none | Decision point — see below. |

**No hard dependency conflicts** (different languages). Naming: agent's "package" = Pilot's ApplicationDocument(type=resume/cover_letter/qa_answers).

---

## 4. Gaps in Job-Pilot to fill from the agent

1. **Resume tailoring service** ← `ResumeTailor` + `skills/ats-resume-tailoring/`.
2. **Q&A answer generation** ← `QuestionAnswerer` (with sensitivity gates) → populates `ApplicationAnswer`.
3. **Application package / field maps** ← `ApplicationPackager` + `field_maps.py` → extension contract + `ApplicationDocument`.
4. **ATS resume-tailoring skill assets** ← copy `skills/ats-resume-tailoring/` verbatim (provider-agnostic, reusable).
5. **(Optional) browser automation** ← Greenhouse/Lever handlers → `server/services/automation/` (Pilot's roadmap Phase 10).
6. **Worker pipeline** ← the agent's `run_scan` orchestration → `server/workers/`.

---

## 5. Merge plan (executed after strategy confirmation)

1. Copy the `ats-resume-tailoring` skill assets into Job-Pilot (`server/skills/` or `.claude/skills/`).
2. Add `server/services/resume/tailor-service.ts` (port of `ResumeTailor`, routed through `services/ai`).
3. Add `server/services/application/qa-generator.ts` (port of `QuestionAnswerer`).
4. Add `server/services/application/application-package.ts` + `server/services/automation/field-maps.ts` (port of packager + field maps).
5. New routes: `POST /api/applications/:id/tailor-resume`, `/generate-answers`, `/package`.
6. Wire generated artifacts into `ApplicationDocument` / `ApplicationAnswer`; reuse cost tracking.
7. Preserve safety model (never auto-submit, sensitivity escalation → `ASSISTED_REQUIRED`/`NEEDS_APPROVAL`).
8. Port the Python unit tests to vitest equivalents.
9. Update README + CLAUDE.md; remove dead/duplicate paths.

---

## 6. Executed outcome

Decision: **Hybrid** integration (skill assets copied verbatim; orchestration
re-implemented in TypeScript — no Python runtime), **full scope** (tailoring + Q&A
+ package + Playwright automation + worker pipeline), on branch
`merge/job-applying-agent`.

**New / changed in Job-Pilot:**

| Area | Files |
|---|---|
| Skill assets (verbatim) | `server/skills/ats-resume-tailoring/**` |
| Resume tailoring | `server/services/resume/{skill-loader,resume-content,resume-renderer,tailor-service}.ts` |
| Q&A | `server/services/application/qa-generator.ts` |
| Packager + outreach + generator | `server/services/application/{application-package,outreach,application-generator}.ts` |
| Automation | `server/services/automation/{platform-detector,field-maps,form-filler}.ts` |
| Profile + AI + storage | `server/services/profile/candidate-profile.ts`, `server/services/ai/{prompts,model-config,usage-recorder}.ts`, `server/services/storage/artifact-storage.ts` |
| Worker | `server/workers/application-pipeline.ts` (chained from `runs`/subscription) |
| Routes | `server/routes/files.ts`; expanded `server/routes/applications.ts`; real DB-backed `server/routes/runs.ts` |
| Schema | `ApplicationDocument.metadataJson` (additive) |
| Frontend | `src/pages/review/review.tsx` (real data), `src/services/api/applications.ts` |
| Tests | platform-detector, qa-generator, application-package, resume-renderer (vitest) |

**Mapping vs the Python engine:** BigQuery `*_jobs`/`*_details` → Prisma
`Job`/`Application`/`UserProfile`; GCS + signed URLs → local artifact store +
auth'd `/api/files` route (GCS seam retained); Pydantic models → Zod; `render_resume.py`
→ `resume-renderer.ts` (the Python renderer is preserved in the skill folder as the
canonical spec). The legacy Python Playwright handlers were re-implemented in TS, not
ported. `READY_FOR_USER` maps to `NEEDS_APPROVAL` / `ASSISTED_REQUIRED`.

**Verification:** `npm run typecheck`, `npx vitest run` (32 tests), and
`npm run build` all pass.

**Deploy note:** the schema change is additive and optional; apply with
`prisma db push` (the repo gitignores `prisma/migrations/` and manages dev via push).
Playwright browsers must be installed in the runtime image for the submit step.
