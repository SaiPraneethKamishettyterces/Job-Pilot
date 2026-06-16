import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import { env } from "./lib/env.js";
import { corsOrigins } from "./lib/config.js";
import { logger } from "./lib/logger.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
import { authLimiter, aiLimiter } from "./middleware/rate-limit.js";
import { claudeRouter } from "./routes/claude.js";
import { authRouter } from "./routes/auth.js";
import { resumesRouter } from "./routes/resumes.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { runsRouter } from "./routes/runs.js";
import { profileRouter } from "./routes/profile.js";
import { jobsRouter } from "./routes/jobs.js";
import { applicationsRouter } from "./routes/applications.js";
import { statsRouter } from "./routes/stats.js";
import { billingRouter } from "./routes/billing.js";
import { subscriptionRouter, stripeWebhookHandler } from "./routes/subscription.js";
import { ingestionRouter } from "./routes/ingestion.js";
import { filesRouter } from "./routes/files.js";
import { activityRouter } from "./routes/activity.js";
import { accountRouter } from "./routes/account.js";
import { startRetryWorker } from "./workers/retry-worker.js";

const app = express();

// Behind Cloud Run's proxy — trust the first hop so req.ip reflects the real
// client (correct rate-limit keying + logging).
app.set("trust proxy", 1);

const allowedOrigins = corsOrigins();
app.use(
  cors({
    origin: allowedOrigins.includes("*") ? true : allowedOrigins,
  }),
);

// Stripe webhook MUST receive the raw body to verify the signature, so it is
// registered before express.json() consumes/parses the request body.
app.post("/api/subscription/webhook", express.raw({ type: "application/json" }), stripeWebhookHandler);

app.use(express.json());
app.use(requestLogger);

// Liveness: process is up. Used by the Cloud Run smoke test.
app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

// Readiness: dependencies (DB) reachable. Returns 503 when not, so a load
// balancer / deploy gate won't route traffic to an instance that can't serve.
app.get("/readiness", async (_req, res) => {
  try {
    const { prisma } = await import("./lib/db.js");
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ready", db: "ok" });
  } catch (err) {
    logger.error({ err: String(err) }, "Readiness check failed");
    res.status(503).json({ status: "not_ready", db: "unavailable" });
  }
});

app.use("/api/auth", authLimiter, authRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/resumes", resumesRouter);
app.use("/api/runs", runsRouter);
app.use("/api/claude", aiLimiter, claudeRouter);
app.use("/api/profile", profileRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/billing", billingRouter);
app.use("/api/subscription", subscriptionRouter);
app.use("/api/ingestion", ingestionRouter);
app.use("/api/files", filesRouter);
app.use("/api/activity", activityRouter);
app.use("/api/account", accountRouter);

// JSON 404 for any unmatched API route (before the SPA catch-all below).
app.use("/api", notFoundHandler);

if (env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "..");
  app.use(express.static(distPath));
  // Express 5 dropped bare "*" wildcards — use a named splat for the SPA fallback.
  app.get("/*splat", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

// Central error handler — must be registered last.
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`BFF running on http://localhost:${env.PORT}`);
  // Start background workers (e.g. failed-application retry). No-op when disabled.
  startRetryWorker();
});
