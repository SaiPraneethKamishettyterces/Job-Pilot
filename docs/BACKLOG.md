# JobPilot — Tasks Backlog

A running list of work to do later. Append freely as ideas come up; don't delete —
move done items to the bottom under **Done**. Each item: a short title + intent so
future-us remembers the "why", not just the "what".

_Created: 2026-06-17_

---

## Open

### 1. Broaden job sources beyond Greenhouse/Lever (no-login boards)
Expand ingestion to pull jobs from more ATS/job sites available in the market —
**only those that don't require login or email verification to read postings**.
Keep the "public JSON / no bot-protection bypass" principle. Goal: a much larger,
fresher pool to choose the best matches from.

### 2. Make signup-required portals (Workday, etc.) low-effort
For portals that require account creation/login (Workday, iCIMS, SmartRecruiters,
…), make applying as close to effortless as possible — minimize human steps while
respecting each portal's rules (no bot-protection bypass). Smooth the
assisted-handoff so these "hard" portals feel easy for the user.

### 3. Keep improving "best 30 jobs" matching
Push the matching quality further in every way possible — richer signals, better
ranking, dedup across history, learning from user approve/decline, etc. (Builds on
the global top-N + full-resume scoring already shipped.)

### 4. Fill ALL required application fields (broad field coverage)
Study as many real application forms as possible and ensure the product can fill
almost every field the current market portals ask for. Expand the field maps +
profile data model so coverage is near-complete, not just the common fields.

### 5. Tiered plans by daily volume (30 / 50 / 75 per day) + pricing
Introduce plan levels — e.g. 30/day, 50/day, 75/day — and price them accordingly.
Wire the per-day caps + monthly allowances + Stripe prices to match.

### 6. Fine-grained admin billing/financial dashboard
Admin-only dashboard to track how the product is doing financially at a fine
grain: total costs, cost per user, product/infra costs, margins, trends. (Extends
the existing AI-cost dashboard.)

### 7. End-to-end test (we run fully free)
Build a real end-to-end test of the whole flow (signup → onboarding → run →
score → generate → review → assisted submit). Feasible to run for free now that AI
is on the Gemini free tier.

### 8. User dashboard polish + full click/connection coverage
Improve the user dashboard; test every click/component and confirm each is wired
to its real data source. The **Applications page** should clearly show **day-wise
applications** — what happened each day, each application's status, clearly
organized.

### 9. Smarter autofill + best-practice question answering
Make the autofill engine intelligent: a comprehensive bank of generic questions,
and ensure the LLM follows the best skill/prompt to answer job-specific questions
well. (Builds on the semantic-match + Q&A work already shipped.)

---

## Done

_(move completed items here with the date)_
