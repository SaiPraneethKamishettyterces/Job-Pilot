# Claude Code — JobPilot (auto-apply application)

AI-powered job application platform. **Modular monolith**: React 19 + Vite (UI) + Express 5 (BFF/app-tier) + Prisma/PostgreSQL, using the Anthropic SDK (`@anthropic-ai/sdk`) to parse resumes, score job matches, generate tailored documents, and automate applications. Deploys to Cloud Run via `Dockerfile` + `cloudbuild.yaml`.

> Governance home: **Terces-Solutions** org. Adopts the `terces-ai-ops` framework — manifest **`platform-ui`** (generic client UI, non-F&B vertical).

## Structure

- `src/pages/`, `src/app/` — application pages and routing (React Router)
- `src/components/` — shared UI components (Radix + Tailwind)
- `src/admin/` — admin surface (separate Vite entry: `vite.admin.config.ts`)
- `src/hooks/`, `src/services/`, `src/lib/`, `src/utils/`, `src/types/` — client logic
- `server/index.ts` — Express entrypoint
- `server/routes/` — REST endpoints (auth, jobs, applications, resumes, billing, claude, …)
- `server/services/` — domain services (ai, matching, resume, job-discovery, application, billing, ingestion, storage, usage)
- `server/lib/` — auth-middleware, db, env, logger, token-tracker
- `server/workers/` — background workers (auto-apply pipeline)
- `prisma/schema.prisma` — Postgres schema

## Rules

- **Charts: `recharts`** (current repo standard). Note: the framework UI standard is Plotly; converging is a Phase-5 alignment item, not yet adopted here — do not introduce Chart.js.
- **Test the production build locally** (`npm run build`) before triggering the Cloud Build / Cloud Run deploy.
- **Styling: Tailwind v4 + Radix primitives.** Dark mode via CSS variables.
- **Secrets via env, never committed.** `ANTHROPIC_API_KEY`, `JWT_SECRET`, `DATABASE_URL` come from `.env` locally (gitignored) and from **Secret Manager** in prod — never hard-code, never commit `.env`.
- **Anthropic SDK usage** is centralized in `server/services/ai` and `server/routes/claude.ts`. Default to the latest, most capable Claude models; route all model calls through that layer (it also feeds `token-tracker`).
- **This repo is the app-tier**, not a data-platform repo — no Dataform/medallion/BigQuery work belongs here.

## Governance — Route-First Rule

For non-trivial work, dispatch to the right subagent **before** doing the work yourself. Trivial fast-path (short factual question, single-file read, one-line edit, in-flight continuation) → handle directly.

| Subagent | Route when the task is about… |
|---|---|
| `planner` | BRD/spec authoring, lifecycle gates, portfolio, change requests, planning artifacts |
| `frontend-engineer` | React/Vite UI, pages, components, charts, UI deploys, pre-release UI gates |
| `data-engineer` | App-tier Express routes/services, Prisma schema, data access, API performance |
| `governance` | IAM, secrets/classification, monitoring, compliance, client lifecycle |
| `reviewer` | Cross-cutting code review, blast-radius/impact, refactor safety, debugging traces |

Always route: multi-file work in one domain, deliverable artifacts (specs, audits, reviews), or methodology-driven tasks. If a task could match >1 agent, pick the one whose owned skill most directly addresses the deliverable; when in doubt, ask.

## MCP plane (ADR-0008 / ADR-0009)

This is a greenfield client-facing app → **commodity plane only**.

- Register **`insforge`** (`mcp__insforge__*`): auth, file storage, app-tier CRUD, edge functions, realtime, pgvector.
- **NEVER** register or call **`terces`** (`mcp__terces__*`) tools — Dataform, medallion, guardrails, Dataplex, skill/agent dispatch belong to the proprietary plane and not here.
- The boundary is enforced by registration: until InsForge is self-hosted (backlog C25/C29), `.mcp.json` stays absent and no MCP tools are available here. Do not add `terces` to work around that.

## Framework adoption

Skills/commands/agents are provided under `.claude/` by the `terces-ai-ops` GitHub Action sync (org repos) or by `../terces-ai-ops/templates/init.sh platform-ui` (local symlink bootstrap; requires Developer Mode on Windows). **Never modify governance files from this repo; extend with repo-local skills in `.claude/skills/`. Framework changes go via PR into `terces-ai-ops`.**
