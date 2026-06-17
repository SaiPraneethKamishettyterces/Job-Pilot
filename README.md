# JobPilot — AI-Powered Job Application Platform

> Discover jobs, score matches, generate tailored documents, automate applications, and track everything — all from one intelligent dashboard.

---

## Overview

JobPilot is a full-stack SaaS application that uses Claude AI (Anthropic) to automate and intelligently manage the entire job application lifecycle. It parses your resume, discovers relevant jobs, scores them against your profile, generates tailored resumes and cover letters, and submits applications on your behalf — with configurable approval controls so you stay in charge.

Built as a **modular monolith** (React + Express) designed to scale into microservices as the product grows.

---

## End-to-end application pipeline

JobPilot now runs the complete workflow end-to-end. The Python `Job_applying_agent`
engine has been merged in (re-implemented in TypeScript — see
[docs/MERGE_ANALYSIS.md](docs/MERGE_ANALYSIS.md)):

0. **Onboard** — the user fills profile + preferences and an **Application Details**
   step that captures the generic questions every ATS asks (legal/preferred name,
   address, work auth + sponsorship, employment, education, logistics, sourcing,
   optional EEO, consent) **once** — stored on `UserProfile` and reused on every
   application. Role-specific answers are handled per-application (`ApplicationAnswer`).
1. **Discover** — `POST /api/runs/start` (or a paid subscription activation) kicks off
   the pipeline worker (`server/workers/application-pipeline.ts`): ingest jobs from
   public ATS boards (Greenhouse/Lever). Autofill + platform detection also cover
   **Ashby** and **Workable** (`server/services/automation/`).
2. **Score** — each job is scored against the candidate (`matching/match-scorer`).
3. **Generate** — for shortlisted jobs an `Application` is created and its documents
   are generated (`services/application/application-generator.ts`):
   - **Tailored resume** via the bundled `ats-resume-tailoring` skill
     (`server/skills/`) — Claude emits structured JSON, validated, then rendered to a
     deterministic ATS-safe **DOCX** (`services/resume/`). Verified personal info is
     force-applied so it can never be altered.
   - **Cover letter** and **cold email** (`services/application/outreach.ts`).
   - **Q&A answers** with sensitivity gates (`services/application/qa-generator.ts`):
     custom answers → profile fields → AI (generic only) → escalate to the user.
   - **Autofill package** (`services/application/application-package.ts`): the
     field-selector contract the browser extension / automation consumes.
4. **Approve** — the Review queue surfaces generated documents; the user approves,
   edits, or declines (`/api/applications/:id/{generate,approve,decline,answers}`).
5. **Submit** — `POST /api/applications/:id/submit` drives Playwright
   (`services/automation/form-filler.ts`) to autofill the live form.

**Safety model (preserved from the engine):** nothing is auto-submitted by default.
`AUTO_SUBMIT=false` fills the form and leaves it for the user to review + submit;
CAPTCHA / login / OTP blockers and unsupported ATS are surfaced as
`ASSISTED_REQUIRED`, never bypassed. Every Claude call is cost-tracked to
`AIUsageEvent`.

### Additional env vars

| Variable | Default | Purpose |
|----------|---------|---------|
| `MAX_UPLOAD_MB` | `8` | Max upload size for resume files. Generated documents are stored in Postgres (the `Artifact` table) and served via the auth'd `/api/files` route — no external object store. See `services/storage/artifact-storage.ts`. |
| `AUTO_SUBMIT` | `false` | Whether the automation actually clicks submit. Off = prepare-only. |

> Playwright browsers are required only for the submit step. Install with
> `npx playwright install chromium` (the deploy image should add them); if absent,
> submit gracefully returns `ASSISTED_REQUIRED`.

> **Repo note:** the unused `infra/` Terraform was removed from the active workflow
> (recoverable from git history) pending the productionization phase. `Dockerfile`,
> `cloudbuild.yaml`, and `.github/workflows` are retained for that step. See
> [docs/AUDIT.md](docs/AUDIT.md) for the full audit + prioritized TODO.

---

## Screenshots

| Login | Onboarding | Dashboard |
|-------|------------|-----------|
| Split-panel auth with stats | 5-step wizard | Stats, recent apps, quick actions |

| Applications Tracker | Review Queue | Resume & Profile |
|----------------------|--------------|-----------------|
| Filterable table with scores | Side-by-side approval flow | Tabbed parsed profile |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Browser (React)                       │
│  React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP / SSE
┌──────────────────────────▼──────────────────────────────────┐
│                   Express 5 BFF (Node.js)                    │
│  JWT Auth · Modular Routes · Multer · Pino · Zod Validation  │
└───┬───────────────┬──────────────────┬───────────────────────┘
    │               │                  │
    ▼               ▼                  ▼
Anthropic       PostgreSQL         Google Cloud
Claude API    (Cloud SQL via       Storage (files)
(Sonnet/Opus)    Prisma ORM)
```

### Module Breakdown

| Module | Responsibility |
|--------|---------------|
| **Profile Engine** | Resume upload, text extraction (PDF/DOCX), Claude parsing, editable profile |
| **Job Discovery Engine** | Source adapters (Greenhouse, Lever, Ashby, Workable, manual paste) |
| **Match Scoring Engine** | Title, skill, experience, location, salary, ATS scoring (0–100) |
| **Resume + Cover Letter Engine** | Tailored documents using only verified profile data — no hallucinations |
| **Application Automation Engine** | Playwright-based ATS form submission with configurable approval modes |
| **Tracking + Analytics Engine** | Per-application status, follow-up dates, funnel analytics |
| **Billing + Admin Engine** | Stripe subscriptions, token usage tracking, admin dashboard |

---

## Tech Stack

### Frontend

| Area | Technology |
|------|-----------|
| Framework | React 19 |
| Build tool | Vite 8 |
| Language | TypeScript 6 |
| Routing | React Router v7 |
| Server state | TanStack Query v5 |
| Styling | Tailwind CSS v4 |
| UI Components | shadcn/ui (Radix UI primitives) |
| Forms | React Hook Form + Zod |
| Tables | TanStack Table v8 |
| Charts | Recharts |
| File upload | react-dropzone |
| Notifications | Sonner |
| Icons | Lucide React |

### Backend

| Area | Technology |
|------|-----------|
| Runtime | Node.js + TypeScript |
| Framework | Express 5 |
| Validation | Zod |
| ORM | Prisma 6 |
| Auth | JWT (jsonwebtoken) + bcryptjs |
| File handling | Multer |
| PDF parsing | pdf-parse |
| DOCX parsing | Mammoth |
| AI SDK | @anthropic-ai/sdk |
| Streaming | Server-Sent Events |
| Logging | Pino + pino-pretty |
| Browser automation | Playwright (Phase 10) |

### Infrastructure

| Need | Tool |
|------|------|
| App database | Google Cloud SQL (PostgreSQL) |
| ORM | Prisma |
| File storage | Google Cloud Storage |
| Secrets | Google Secret Manager |
| Auth | Firebase Auth (planned) / JWT (current) |
| Deployment | Google Cloud Run |
| Scheduled runs | Google Cloud Scheduler |
| Async jobs | Google Pub/Sub |
| Analytics warehouse | BigQuery (Phase 12+) |
| Billing | Stripe |

---

## Database Schema

20 tables across 5 domains:

```
Auth          → User
Profile       → UserProfile, UserPreference
Resume        → Resume, ResumeVersion
Jobs          → JobSource, Job, JobMatch
Applications  → ApplicationRun, Application, ApplicationDocument,
                ApplicationAnswer, RecruiterContact, ApplicationEvent
AI / Billing  → AIUsageEvent, Plan, Subscription
```

Key enums:
- `ApplicationStatus`: DISCOVERED → SHORTLISTED → GENERATED → NEEDS_APPROVAL → APPROVED → APPLIED → ...
- `RunStatus`: CREATED → DISCOVERING_JOBS → SCORING → GENERATING_DOCUMENTS → APPLYING → COMPLETED
- `ApprovalMode`: AUTO_APPLY | ASSISTED_APPLY | ALWAYS_REVIEW | DRAFT_ONLY

---

## Application Flow

```
User signs up
   ↓
5-step onboarding
  1. Basic details (name, phone, location, LinkedIn, work auth)
  2. Resume upload → Claude parses into structured JSON profile
  3. Target roles + companies + blocklist
  4. Location, remote preference, salary expectation
  5. Approval mode + applications per day + match threshold
   ↓
Dashboard
   ↓
Start Run
   ↓
[Discover jobs] → [Parse JDs] → [Score matches] → [Filter by threshold]
   ↓
[Generate tailored resume + cover letter + Q&A + cold email]
   ↓
Based on approval mode:
  AUTO_APPLY     → Submit directly (simple ATS only)
  ASSISTED_APPLY → Prepare + pause before submit
  ALWAYS_REVIEW  → Queue to Review Queue
  DRAFT_ONLY     → Generate documents, no submission
   ↓
Application Tracker (status, score, documents, follow-ups)
```

---

## Project Structure

```
auto-apply application/
├── src/
│   ├── app/                    # Providers (QueryClient, Auth, Toaster)
│   ├── pages/
│   │   ├── auth/               # Login, Signup
│   │   ├── onboarding/         # 5-step wizard + step components
│   │   ├── dashboard/          # Stats, recent activity, quick actions
│   │   ├── applications/       # Filterable tracker table
│   │   ├── runs/               # Start Run + run history
│   │   ├── review/             # Approval queue with preview panel
│   │   ├── resume/             # Upload + tabbed parsed profile
│   │   ├── analytics/          # Funnel + stats (MVP 6)
│   │   ├── billing/            # Plans + usage
│   │   └── settings/           # Account, rules, notifications
│   ├── components/
│   │   ├── ui/                 # 20 shadcn-style components
│   │   ├── layout/             # Sidebar, Header, AppLayout (auth guard)
│   │   ├── forms/
│   │   ├── tables/
│   │   ├── application/
│   │   └── resume/
│   ├── lib/
│   │   ├── auth.tsx            # AuthContext + JWT token management
│   │   ├── query-client.ts     # TanStack Query config
│   │   └── utils.ts            # cn(), formatDate(), scoreColor()
│   ├── hooks/
│   │   └── useClaudeStream.ts  # SSE streaming hook
│   ├── services/
│   │   └── api.ts              # Axios API client
│   └── types/
│       └── index.ts            # All shared TypeScript interfaces
│
├── server/
│   ├── index.ts                # Express app entry point
│   ├── routes/
│   │   ├── auth.ts             # POST /signup, /login
│   │   ├── resumes.ts          # POST /upload-parse (multer + Claude)
│   │   ├── onboarding.ts       # POST /complete
│   │   ├── runs.ts             # POST /start, GET /
│   │   └── claude.ts           # Streaming cover letter (legacy)
│   ├── services/               # ai/, profile/, resume/, matching/, ...
│   ├── workers/                # run-worker, application-worker (Phase 10)
│   └── lib/
│       ├── env.ts              # Typed environment config
│       ├── logger.ts           # Pino logger
│       ├── auth-middleware.ts  # requireAuth JWT middleware
│       └── token-tracker.ts    # AI cost calculator
│
├── prisma/
│   ├── schema.prisma           # Full 20-table schema
│   └── migrations/
│
└── storage/
    └── templates/
```

---

## Getting Started

### Prerequisites

- Node.js ≥ 20 LTS
- PostgreSQL (local or Cloud SQL)
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone and install

```bash
git clone https://github.com/SaiPraneethKamishettyterces/Job-Pilot.git
cd Job-Pilot
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
UI_ORIGIN=http://localhost:5173
DATABASE_URL=postgresql://user:password@localhost:5432/jobpilot
JWT_SECRET=your-long-random-secret
LOG_LEVEL=info
```

### 3. Set up the database

```bash
npx prisma migrate dev --name init
npx prisma generate
```

### 4. Run the app

```bash
npm run dev
```

- **Frontend:** http://localhost:5173
- **Backend API:** http://localhost:3001
- **Health check:** http://localhost:3001/health

---

## API Reference

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account → returns JWT + user |
| POST | `/api/auth/login` | Authenticate → returns JWT + user |

### Onboarding

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/onboarding/complete` | ✓ | Save profile + preferences |
| GET | `/api/onboarding/data` | ✓ | Retrieve saved onboarding data |

### Resumes

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/resumes/upload-parse` | ✓ | Upload PDF/DOCX → Claude extracts structured JSON profile |

### Runs

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/runs/start` | ✓ | Start a new application run |
| GET | `/api/runs` | ✓ | List all runs for current user |
| GET | `/api/runs/:id` | ✓ | Get a specific run |

### Claude (streaming)

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/claude/apply` | — | Stream AI-generated cover letter (SSE) |
| POST | `/api/claude/count-tokens` | — | Estimate token count for a prompt |

---

## MVP Roadmap

| MVP | Feature | Status |
|-----|---------|--------|
| 1 | User signup + profile setup | ✅ Done |
| 2 | Resume upload + Claude parser | ✅ Done |
| 3 | Manual job URL / JD paste + parser | 🔄 Next |
| 4 | Match scoring engine | 🔄 Next |
| 5 | Tailored resume + cover letter + Q&A + cold email | 🔄 Next |
| 6 | Application tracker with full status lifecycle | ✅ UI Done |
| 7 | Start Run button + run engine | ✅ UI Done |
| 8 | Review queue (approve / edit / decline) | ✅ UI Done |
| 9 | Token usage tracking + cost per feature | 🔄 Next |
| 10 | Billing limits + Stripe integration | 🔄 Planned |
| 11 | Assisted browser automation (Playwright) | 🔄 Planned |
| 12 | Auto apply for simple ATS (Greenhouse, Lever, Ashby) | 🔄 Planned |

---

## AI Guardrails

The system enforces strict truthfulness in all AI-generated content:

- **Never** invents skills, certifications, employment, or education
- **Never** changes dates, degree names, or company names
- **Only** rewrites, reorders, and emphasizes experience that exists in the verified profile
- **Always pauses** for sensitive questions: work authorization, sponsorship, disability, veteran status, salary, relocation
- **Never bypasses** CAPTCHA, OTP, or login protections
- Low-confidence automation → auto-escalates to the Review Queue

---

## Match Scoring Formula

```
Final Score =
  25% title/role match
+ 30% skill overlap (required vs. user skills)
+ 15% experience level match
+ 10% location / work mode fit
+ 10% salary / work authorization compatibility
+ 10% company preference + ATS complexity factor
```

Jobs scoring below the user's configured threshold (default: 70%) are archived with reason codes rather than applied to.

---

## Approval Modes

| Mode | Behavior |
|------|----------|
| **Auto Apply** | Submits automatically to simple ATS forms. Pauses for sensitive fields. |
| **Assisted Apply** | Prepares everything, pauses before each final submission. |
| **Always Review** | All applications queue in the Review Queue — user decides what gets submitted. |
| **Draft Only** | Generates tailored documents only. Zero auto-submission. |

---

## ATS Support Plan

| ATS | Mode |
|-----|------|
| Greenhouse | Auto / Assisted |
| Lever | Auto / Assisted |
| Ashby | Auto / Assisted |
| Workable | Auto / Assisted |
| Workday | Assisted only |
| Oracle / ICIMS / SuccessFactors | Assisted only |
| Login / OTP / CAPTCHA | Pause + notify user |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes | Claude API key from console.anthropic.com |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Secret for signing JWT tokens |
| `PORT` | No | BFF server port (default: 3001) |
| `UI_ORIGIN` | No | Allowed CORS origin (default: http://localhost:5173) |
| `LOG_LEVEL` | No | Pino log level (default: info) |
| `GCP_PROJECT` | No | GCP project ID for Cloud Storage (Phase 4+) |

---

## Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feature/job-parser`
3. Commit your changes following the module structure above
4. Open a PR — describe which MVP phase your change belongs to

---

## License

MIT © 2025 Terces Solutions

---

> Built with Claude AI · React · Express · PostgreSQL · Deployed on Google Cloud Run
