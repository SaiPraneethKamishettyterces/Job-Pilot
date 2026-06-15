import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler, notFoundHandler } from "./middleware/error-handler.js";
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
import { subscriptionRouter } from "./routes/subscription.js";
import { ingestionRouter } from "./routes/ingestion.js";

const app = express();

app.use(cors({ origin: env.UI_ORIGIN }));
app.use(express.json());
app.use(requestLogger);

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/resumes", resumesRouter);
app.use("/api/runs", runsRouter);
app.use("/api/claude", claudeRouter);
app.use("/api/profile", profileRouter);
app.use("/api/jobs", jobsRouter);
app.use("/api/applications", applicationsRouter);
app.use("/api/stats", statsRouter);
app.use("/api/billing", billingRouter);
app.use("/api/subscription", subscriptionRouter);
app.use("/api/ingestion", ingestionRouter);

// JSON 404 for any unmatched API route (before the SPA catch-all below).
app.use("/api", notFoundHandler);

if (env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "..");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

// Central error handler — must be registered last.
app.use(errorHandler);

app.listen(env.PORT, () => {
  logger.info(`BFF running on http://localhost:${env.PORT}`);
});
