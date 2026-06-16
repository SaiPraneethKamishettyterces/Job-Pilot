# JobPilot — Runbook (local dev, test, end-to-end)

## Prerequisites
- Node 20+ and npm
- PostgreSQL (local or Cloud SQL)
- (optional) Anthropic API key — without it, AI steps degrade to deterministic fallbacks
- (optional) Stripe test account — without it, billing runs in **test mode** (`/activate`)
- (optional) Playwright browsers for the submit step: `npx playwright install chromium`

## 1. Configure
```bash
cp .env.example .env
# Fill at least DATABASE_URL and JWT_SECRET. Add ANTHROPIC_API_KEY + STRIPE_* to
# exercise the full flow. All config is read through server/lib/config.ts.
```

## 2. Install + database
```bash
npm install
npx prisma generate
# Create/sync the schema (the repo manages dev schema via db push):
npx prisma db push
# (Prod uses `prisma migrate deploy`; the metadataJson column migration lives in
#  prisma/migrations/ but is gitignored per repo convention — db push applies it.)
```

## 3. Run
```bash
npm run dev          # UI (5173) + API (3001) together
# or individually:
npm run dev:ui       # Vite UI  → http://localhost:5173
npm run dev:server   # Express  → http://localhost:3001
npm run dev:admin    # Admin UI → http://localhost:5174
```

## 4. Build / start (production-style)
```bash
npm run build        # tsc + vite + server tsc + copy skill assets into dist/
npm start            # node dist/server/index.js  (serves API + built SPA)
```

## 5. Tests / typecheck / lint
```bash
npm run typecheck    # tsc -b && tsc -p tsconfig.server.json --noEmit
npm test             # vitest (unit tests for ported logic, config, stripe, status map)
npm run lint
```

## 6. Stripe in test mode
1. Put `sk_test_…`, `pk_test_…`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_PRO` in `.env`.
2. Forward webhooks locally: `stripe listen --forward-to localhost:3001/api/subscription/webhook`
   and copy the printed `whsec_…` into `STRIPE_WEBHOOK_SECRET`.
3. In the UI → Billing → choose a plan → complete Stripe test checkout
   (card `4242 4242 4242 4242`). The webhook activates the subscription and starts
   the pipeline.
- **No Stripe keys?** Billing shows "test mode" and the plan button calls
  `POST /api/subscription/activate` to activate directly (dev/test only; disabled when `NODE_ENV=production`).

## 7. One full end-to-end flow
1. **Sign up** at `/signup`, then **log in**.
2. **Onboarding**: fill profile + preferences (target roles/companies, locations,
   approval mode, match threshold) and **upload a base resume** (PDF/DOCX → parsed).
3. **Billing**: activate a plan (Stripe test checkout, or test-mode activate).
   Activation initializes your data and **starts a run**.
4. The **pipeline** discovers jobs (Greenhouse/Lever) → scores → creates
   Applications for shortlisted jobs → generates **tailored resume (DOCX) + cover
   letter + cold email + autofill package** (cost-tracked to `AIUsageEvent`).
5. **Review** queue (`/review`): inspect the tailored resume (download DOCX),
   cover letter, Q&A, and package warnings → **Approve** / **Decline**, or
   **Auto-fill & Submit**.
6. **Submit** drives Playwright to fill the live form. With `AUTO_SUBMIT=false`
   (default) it fills and marks `READY_FOR_USER_SUBMIT`; CAPTCHA→`CAPTCHA_REQUIRED`,
   login→`LOGIN_REQUIRED`, etc. — never bypassed.
7. **Applications** (`/applications`) shows every job and its live status.

## Manual smoke checks
- `curl localhost:3001/health` → `{ status: "ok" }`
- Without `ANTHROPIC_API_KEY`: tailoring returns a consistent **un-tailored**
  passthrough and says so; scoring returns a mock score.
- Without Playwright browsers: submit returns `ASSISTED_REQUIRED` (no crash).
