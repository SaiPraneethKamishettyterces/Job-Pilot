# Update 0.1.0 — Local-model migration + bug-fix sweep

**Date:** 2026-06-17
**Scope:** Switch all AI tasks to a local open-source model for testing, reset the
local dev database to the collaborator's merged schema, and fix a batch of
onboarding / dashboard / applications / settings / matching bugs found during
manual testing.

> Context: this is a **testing-phase** configuration. The endgame is a fine-tuned
> open-source model served on a real GPU (see Backlog). Cloud providers (Anthropic
> Claude, Google Gemini) are **preserved as commented config** for one-step revert.

---

## 1. AI models — what runs each task NOW

All inference is **local via Ollama** (OpenAI-compatible endpoint
`http://localhost:11434/v1`). Cost = **$0**, fully offline.

| Task | Model (now) | Provider path | Notes |
|------|-------------|---------------|-------|
| Resume tailoring (`tailorResume`) | **qwen2.5:3b** | local | Flipped off Claude → local (one line in `model-config.ts`) |
| Cover letter (`coverLetter`) | **qwen2.5:3b** | local | was Gemini Pro |
| Resume parse (`resumeParse`) | **qwen2.5:3b** | local | structured JSON extraction |
| Job parse (`jobParse`) | **qwen2.5:3b** | local | |
| Match score (`matchScore`) | **qwen2.5:3b** | local | lenient on weak model — see Backlog |
| Cold email (`coldEmail`) | **qwen2.5:3b** | local | |
| Question answer (`questionAnswer`) | **qwen2.5:3b** | local | |
| Embeddings | **nomic-embed-text** (768-dim) | local | semantic Q&A + job dedup/normalize |

**Why qwen2.5:3b, not qwen3:4b:** qwen3 is a *thinking* model. On the
OpenAI-compatible path Ollama routes its `<think>` output out of `content`, so with
the app's small per-task `max_tokens` the response came back **empty**. qwen2.5:3b
is non-thinking → returns clean JSON immediately. (qwen3:4b left on disk, unused.)

**Config source of truth:**
- `.env` → `AI_COMPAT_BASE_URL`, `AI_MODEL_FLASH`, `AI_MODEL_PRO`, `AI_EMBED_MODEL`
- `server/services/ai/model-config.ts` → `TASK_MODEL` routing
- Gemini + Claude configs preserved as comments in both files. To revert to cloud:
  uncomment the Gemini block in `.env`, restore the `tailorResume` Claude line in
  `model-config.ts`, set `ANTHROPIC_API_KEY` / `AI_COMPAT_API_KEY`.

**External (unchanged):** Stripe (billing), job-board APIs (Greenhouse, Lever,
Ashby, Workable — public, no auth).

---

## 2. Environment / infra changes

- **Ollama** installed (v0.30.6) + models pulled: `qwen2.5:3b`, `nomic-embed-text`.
- **Local Postgres** (v17) `jobpilot` DB **reset** and migrated to the merged schema
  (all 5 migrations applied: init, email_verification, postgres_artifacts,
  indexes_and_audit, plan_daily_cap). Prior dev seed data was wiped (user-authorized).
- **Prisma client regenerated** (v7 generates to `node_modules/@prisma/client`).
  Stale client was causing `Unknown argument` errors (Plan.applicationsPerDay,
  UserProfile.consentToDataProcessing).
- `.env` completed with all 37 keys (JWT secret auto-generated for local dev).
- **Playwright Chromium** installed for auto-apply testing.

---

## 3. Bug fixes

| # | Area | Problem | Fix |
|---|------|---------|-----|
| 1 | Onboarding | Inputs lost focus after every keystroke (Application Details) | `Field` component was defined inside the page → new identity each render → remount. Hoisted to module scope. (`step-application-details.tsx`) |
| 2 | Applications | "Something went wrong" crash | `<Tooltip>` used without `TooltipProvider`. Added a **global** `TooltipProvider` in `app/providers.tsx`. |
| 3 | Onboarding finish | "Database unavailable" on Finish Setup; resume parse failed | Both caused by an **orphan dev server** holding `:3001` with a stale Prisma client. Killed orphans, clean restart, regenerated client. Verified `/complete` + resume upload work. |
| 4 | Settings | Approval mode always reverted to "Always Review" | Page was a stub (`save` did nothing, value hardcoded). Now **loads** via `getProfile` and **persists** via `PUT /api/profile/preferences`. |
| 5 | Dashboard | Stat tiles not clickable | Jobs Found→`/jobs`, Shortlisted→`/jobs`, Applied→`/applications?status=APPLIED`, Needs Review→`/review`. Applications page reads `?status=` from URL. |
| 6 | Onboarding | Repetitive questions across Basic vs Application Details | Removed duplicate sponsorship/visa (covered by Work Authorization) and Personal Website (= Portfolio URL). |
| 7 | Documents | Cover letters / cold emails generated but not viewable | New `GET /api/applications/documents` endpoint + **Documents page** (renamed from "Resume"): grid of generated cover letters / cold emails / tailored resumes with viewer + copy. |
| 8 | Navigation | "Candidates" duplicated "Jobs" with internal "T2" label | Retired Candidates from the sidebar. Now: **Jobs Found** (scraped feed) vs **Applications** (applied pipeline). Route kept, off-nav. |
| 9 | Matching | Scraped jobs ignored target roles (every Stripe role ingested, fake ~85%) | Ingestion now loads `targetRoles` and applies a **deterministic role filter** — a title must match all distinctive tokens of a target role (engineer/engineering stemmed). Off-target roles never ingested. Verified: 50 random → 1 real AI-eng role. |
| 10 | Labels | "Parsing with Claude" / "by Claude AI" inaccurate on local model | Made model-agnostic. |

---

## 4. Auto-apply test mode (set up, ready)

Configured a **safe** auto-apply test:
- `.env`: `AUTOMATION_MODE=auto`, `AUTO_SUBMIT=false`, `PLAYWRIGHT_HEADED=true`
- `config.automation.headed` added; `form-filler.ts` launches `headless: !headed`
- Drives a **visible** Chromium to FILL the form, then **stops before Submit** —
  nothing is ever submitted.

**Known limitation (see Backlog):** the blocker detector is over-broad — a "Log in"
link in a page header + landing on the job *posting* (not the form) trips a false
"login blocker." Auto-apply reaches the page but bails before filling on
Greenhouse/Lever posting URLs.

---

## 5. Backlog (still to do)

### Auto-apply / automation
- [ ] **Fix false-positive blocker detection** — detect login by an actual password
      field / login `<form>`, not the substring "log in" in a nav link.
- [ ] **Navigate to the real application form** before detecting/filling — click the
      "Apply" button or use Greenhouse's `job_app?for_…&token=` embed URL so the
      form fields are present (`hasApplicationForm` currently false on posting pages).
- [x] **Full field-resolution engine — every field type filled** (`form-filler.ts`).
      Verified end-to-end on the real Stripe→Greenhouse embed: **16/16 required fields
      filled, 20/20 total, "only Submit remains", stable across runs** (headless,
      AUTO_SUBMIT off). The engine:
  - **Scrapes every control** — text, textarea, native `<select>`, radio groups,
    checkboxes, and custom **comboboxes (react-select)** — with its real human label,
    options, required flag (via the `*` marker) and current filled-state.
  - **Routes each field by meaning** through one ladder (`qa-generator.answerQuestion`):
    *personal/professional/education/links* → deterministic profile match (no LLM);
    *same question reworded* → semantic embedding match on stored answers;
    *immigration / work-auth* → grounded ONLY from profile facts (never invented);
    *open-ended* ("Why Privy?") → AI using JD + profile; *demographic/EEO* → uses the
    candidate's OWN provided self-identification (see below), else **"Decline to
    self-identify"**.
  - **Voluntary EEO uses the user's own answer** (`eeoValue` + profile dropdowns). If the
    candidate set Gender / Race / Veteran / Disability on their profile, the engine fills
    that real value (mapped to each vendor's exact options); only blanks fall back to
    "Decline to self-identify" — it never invents or asserts a demographic. The
    Hispanic/Latino yes-no is derived from race ("Asian" → "No"). The profile editor AND
    the signup wizard now expose these as **dropdowns** (standard EEOC option lists,
    `src/lib/eeo-options.ts`); copy clarifies the value is used to auto-fill (still never
    submitted without review). Verified: Male / No / "not a protected veteran" / "no
    disability" all selected correctly on the live form.
  - **Applies per widget**: fill / selectOption / check radio / tick consent checkbox /
    drive react-select (click the **control container** to open → read options →
    type-to-filter for long lists with empty-filter restore → pick).
  - **Maps representation differences** with an option-constrained LLM pick: the
    candidate value is passed as a hint so "United States" → **"US"**, verbose yes/no →
    the right option, etc. — handles each portal labelling things differently.
  - **Handles conditional fields**: STEP 3 re-scrapes and re-fills in a loop (max 4
    passes) so follow-ups REVEALED by an earlier answer get filled too — e.g. answering
    "Are you Hispanic/Latino?" unhides "Please identify your race", which then fills from
    profile (race = Asian). Loop stops once a pass adds nothing new.
  - **Verifies coverage**: re-scrapes and reports required-filled vs blanks, so the
    result is an honest "only Submit remains" or the exact fields still needing input.
  - Key fixes found via the real form: promote a **collapsed ATS child-iframe to a
    top-level navigation** (Stripe renders the Greenhouse iframe collapsed → react-select
    can't open); drive comboboxes by their **stable DOM id** (react-select drops the
    `data-jp` tag on selection); detect filled-state at the `.select__control`/`.select-shell`
    (the inner `input-container` sits beside the value node, not above it); skip the
    react-select phantom `requiredInput`, the intl-tel search box, and the reCAPTCHA
    textarea; shim `__name` in `page.evaluate` (tsx/esbuild keepNames).
- [ ] **Cross-vendor verification**: engine is vendor-agnostic (label-meaning + generic
      react-select/native handling), validated on Greenhouse. Verify Lever / Ashby /
      Workable forms (combobox markup + file-upload widget) and add per-vendor tweaks
      if needed.
- [x] **Question answering analyses JD + résumé** (`qa-generator` + `prompts.ts`).
      Open-ended questions ("Why this company?", "What relevant experience do you have?")
      now feed the model the **full job description (what the employer wants)** AND the
      **candidate's résumé text (what they actually did)**, with instructions to connect
      the two from real facts only. Verified: grounded, specific answers (e.g. mapped the
      candidate's RAG/LLM work + Python/Vercel/Supabase to Privy's end-to-end-API needs).
      A one-shot retry pushes weak local models past spurious NEEDS_USER_ACTION refusals
      when résumé grounding exists.
- [x] **Employment-history yes/no answered from facts** ("Have you ever been employed by
      Stripe / a Stripe affiliate?"). Derived deterministically: "Yes" only if the named
      company is among the candidate's actual employers, otherwise **"No"** — never a
      false affirmative. (Was previously answered "Yes" by a naive first-option fallback.)
- [ ] **TESTING last-resort pick** is active (`config.qa.answerAll`): a required option
      field the model still can't resolve gets a **negative/safe option** (never a blind
      "Yes") so nothing is blank while validating plumbing. For PROD, remove it so such
      questions surface for the user (tie to the Q&A threshold task below).
- [ ] **Answer prose quality is bounded by the local 3B test model.** The pipeline
      (JD+résumé grounding, fact-only constraints, retry) is correct and produces solid
      answers, but consistency/polish on nuanced prompts needs the prod model — see the
      production model roadmap below.
- [ ] Resume/cover-letter file widgets: confirm `uploadResume` attaches inside the
      iframe across vendors (Greenhouse "Attach" worked; verify Lever/Workable).
- [ ] **Window focus / multi-desktop reliability**: on a multi-monitor / multi-desktop
      setup the headed browser may not fill until the application tab is manually
      clicked (the window/inputs need focus/activation). Observed: fill only worked
      after clicking inside the application tab. Fix so fills are focus-independent —
      e.g. `page.bringToFront()` before filling, fire native input/change events after
      `fill()`, or fill via DOM value + dispatched events rather than relying on the
      OS focus state. Must work regardless of which desktop/monitor is active.

### Q&A thresholds (TESTING override active)
- [ ] **Tune Q&A thresholds for production.** During testing `.env` sets
      `QA_CONFIDENCE_THRESHOLD=0.4` and `QA_ANSWER_ALL=true` so the model drafts and
      auto-fills every open question (nothing left blank). For prod, restore the
      defaults (`0.75` / `false`) — or pick calibrated values — so AI-drafted
      free-text answers (especially "why this company") surface for user review and
      sensitive questions stay grounded. Driven by `config.qa.*`
      (`server/lib/config.ts`); logic in `server/services/application/qa-generator.ts`.

### Matching / data retrieval
- [ ] **Match-score quality**: weak local model rubber-stamps ~80–85%. Add a
      deterministic role/skill-fit component to the score, or move scoring to a
      stronger/fine-tuned model.
- [ ] **Salary filtering** at ingestion (`minSalary` loaded but not applied; most ATS
      jobs lack salary data, so needs care).
- [ ] **More scrapable companies**: Google/Amazon use Workday/custom ATS (no public
      Greenhouse/Lever/Ashby/Workable board) → can't be scraped today. Add a Workday
      adapter and/or expand the curated company→board map.
- [ ] Surface a **warning** when a target company resolves to no board (so the user
      knows e.g. Google/Amazon were skipped instead of silent drop).

### UI / product polish
- [ ] **Jobs Found** page: confirm/relabel full scraped-feed columns (role, location,
      seniority/years, salary, skills, source, link, score, date).
- [ ] **Applications** page: inline per-row links to the tailored resume / cover
      letter / cold email; add date-posted vs date-applied; friendlier status labels.
- [ ] Decide final fate of the `/candidates` route (remove entirely or repurpose).

### Settings / persistence
- [ ] Persist **notification toggles** (Daily digest, Follow-up reminders) — currently
      local-only UI with no storage.
- [ ] Account "Save changes" (name) is still a **no-op stub**.

### Observability
- [ ] `AIUsageEvent` not recorded for the streaming `/api/claude/apply` route (usage is
      computed but not persisted). Wire usage-recorder there if cost analytics matter.

### Production model roadmap (the real endgame)
- [ ] Build a **per-task eval set** (golden input→output examples) — prerequisite for
      any fine-tuning.
- [ ] **Distill** from cloud models (Claude/Gemini label data) → QLoRA fine-tune an
      open model for the high-volume structured tasks (parse/score/QA).
- [ ] Serve prod on **vLLM/TGI on a real GPU** (OpenAI-compatible → swap
      `AI_COMPAT_BASE_URL`, zero app code change). 6GB laptop is dev/test only.
- [ ] Keep prose tasks (cover letter / resume tailoring) on a larger model until a
      fine-tuned small model proves out.

---

## 6. How to run (local testing)

```bash
# 1. Ollama running with models (one-time): qwen2.5:3b + nomic-embed-text
ollama list

# 2. Postgres up; schema applied
npx prisma migrate deploy

# 3. App (UI :5173, API :3001)
npm run dev
```

Auto-apply test: with `AUTOMATION_MODE=auto` + `AUTO_SUBMIT=false`, open an
application → "Auto-fill & Submit" → a browser window opens, fills, and stops before
submitting.
