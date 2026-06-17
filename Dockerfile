FROM node:20-slim AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY . .
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
# NOTE: Chromium/Playwright browsers are intentionally NOT installed — the app
# ships in "assisted" automation mode (AUTOMATION_MODE=assisted): it prepares the
# autofill package + documents and the user submits. This keeps the image small
# and Cloud Run memory low. To enable headless auto-fill (AUTOMATION_MODE=auto),
# add a Playwright/Chromium install step here and raise Cloud Run memory to >=1GiB.
FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production PORT=8080

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json ./

ARG BUILD_SHA=local
ENV BUILD_SHA=${BUILD_SHA}

EXPOSE 8080
CMD ["node", "dist/server/index.js"]
