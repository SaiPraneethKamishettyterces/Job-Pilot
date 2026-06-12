import express from "express";
import cors from "cors";
import { fileURLToPath } from "url";
import path from "path";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { claudeRouter } from "./routes/claude.js";
import { authRouter } from "./routes/auth.js";
import { resumesRouter } from "./routes/resumes.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { runsRouter } from "./routes/runs.js";
import { profileRouter } from "./routes/profile.js";
import { jobsRouter } from "./routes/jobs.js";

const app = express();

app.use(cors({ origin: env.UI_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/resumes", resumesRouter);
app.use("/api/runs", runsRouter);
app.use("/api/claude", claudeRouter);
app.use("/api/profile", profileRouter);
app.use("/api/jobs", jobsRouter);

if (env.NODE_ENV === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const distPath = path.resolve(__dirname, "..");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
}

app.listen(env.PORT, () => {
  logger.info(`BFF running on http://localhost:${env.PORT}`);
});
