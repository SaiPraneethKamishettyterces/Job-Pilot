import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";

export const onboardingRouter = Router();

const schema = z.object({
  fullName: z.string().min(2),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  workAuthorization: z.string().optional(),
  yearsExperience: z.number().optional(),
  targetRoles: z.array(z.string()),
  targetCompanies: z.array(z.string()),
  blockedCompanies: z.array(z.string()),
  locations: z.array(z.string()),
  remotePreference: z.string(),
  minSalary: z.number().optional(),
  applicationsPerDay: z.number().min(1).max(50),
  approvalMode: z.enum(["AUTO_APPLY", "ASSISTED_APPLY", "ALWAYS_REVIEW", "DRAFT_ONLY"]),
  matchThreshold: z.number().min(50).max(95),
});

// In-memory for dev
const onboardingData = new Map<string, object>();

onboardingRouter.post("/complete", requireAuth, async (req: AuthRequest, res) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid onboarding data", errors: parsed.error.issues });
    return;
  }

  const userId = req.userId!;
  onboardingData.set(userId, parsed.data);
  logger.info({ userId }, "Onboarding completed");

  res.json({ message: "Onboarding saved", onboardingDone: true });
});

onboardingRouter.get("/data", requireAuth, async (req: AuthRequest, res) => {
  const data = onboardingData.get(req.userId!);
  if (!data) { res.status(404).json({ message: "No onboarding data" }); return; }
  res.json(data);
});
