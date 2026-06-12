import express from "express";
import cors from "cors";
import { env } from "./lib/env.js";
import { logger } from "./lib/logger.js";
import { claudeRouter } from "./routes/claude.js";
import { authRouter } from "./routes/auth.js";
import { resumesRouter } from "./routes/resumes.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { runsRouter } from "./routes/runs.js";

const app = express();

app.use(cors({ origin: env.UI_ORIGIN }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));

app.use("/api/auth", authRouter);
app.use("/api/onboarding", onboardingRouter);
app.use("/api/resumes", resumesRouter);
app.use("/api/runs", runsRouter);
app.use("/api/claude", claudeRouter);

app.listen(env.PORT, () => {
  logger.info(`BFF running on http://localhost:${env.PORT}`);
});
