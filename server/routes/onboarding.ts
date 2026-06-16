import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { unauthorized, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { userRepository } from "../repositories/user-repository.js";
import {
  upsertProfile,
  upsertPreferences,
  getProfile,
  getPreferences,
} from "../services/profile/profile-service.js";
import { onboardingSchema } from "../../shared/validation.js";

export const onboardingRouter = Router();

onboardingRouter.post("/complete", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    res.status(400).json({
      message: firstIssue
        ? `${firstIssue.path.join(".") || "field"}: ${firstIssue.message}`
        : "Invalid onboarding data",
      errors: parsed.error.issues,
    });
    return;
  }

  const userId = req.userId!;
  const data = parsed.data;

  // Guard against a valid token that references a user who no longer exists
  // (e.g. after a database reset) — otherwise the profile upsert fails with a
  // foreign-key violation. Tell the client to re-authenticate instead.
  const userExists = await userRepository.exists(userId);
  if (!userExists) throw unauthorized("Session is no longer valid. Please log in again.");

  await upsertProfile(userId, {
    fullName: data.fullName,
    phone: data.phone,
    location: data.location,
    linkedinUrl: data.linkedinUrl,
    githubUrl: data.githubUrl,
    portfolioUrl: data.portfolioUrl,
    workAuthorization: data.workAuthorization,
    yearsExperience: data.yearsExperience,
  });

  await upsertPreferences(userId, {
    targetRoles: data.targetRoles,
    targetCompanies: data.targetCompanies,
    blockedCompanies: data.blockedCompanies,
    locations: data.locations,
    remotePreference: data.remotePreference,
    minSalary: data.minSalary,
    applicationsPerDay: data.applicationsPerDay,
    approvalMode: data.approvalMode,
    matchThreshold: data.matchThreshold,
  });

  await userRepository.update(userId, { onboardingDone: true });

  logger.info({ userId }, "Onboarding completed and persisted");
  res.json({ message: "Onboarding saved", onboardingDone: true });
}));

onboardingRouter.get("/data", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const [profile, preferences] = await Promise.all([
    getProfile(req.userId!),
    getPreferences(req.userId!),
  ]);
  if (!profile) throw notFound("No onboarding data");
  res.json({ profile, preferences });
}));
