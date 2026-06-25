import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { logger } from "../lib/logger.js";
import {
  getProfile,
  upsertProfile,
  getPreferences,
  upsertPreferences,
} from "../services/profile/profile-service.js";
import { profileSchema, preferencesSchema } from "../../shared/validation.js";

export const profileRouter = Router();

function formatProfile(p: Record<string, unknown> | null) {
  if (!p) return null;
  const {
    skillsJson, educationJson, experienceJson, projectsJson, certificationsJson,
    toolsJson, cloudPlatformsJson, secondarySkillsJson, domainsJson, industriesJson, ...rest
  } = p;
  return {
    ...rest,
    skills: skillsJson ?? [],
    education: educationJson ?? [],
    experience: experienceJson ?? [],
    projects: projectsJson ?? [],
    certifications: certificationsJson ?? [],
    tools: toolsJson ?? [],
    cloudPlatforms: cloudPlatformsJson ?? [],
    secondarySkills: secondarySkillsJson ?? [],
    domains: domainsJson ?? [],
    industries: industriesJson ?? [],
  };
}

function formatPreferences(p: Record<string, unknown> | null) {
  if (!p) return null;
  const {
    targetRolesJson, targetCompaniesJson, blockedCompaniesJson, locationsJson,
    acceptableAdjacentRolesJson, excludedRolesJson, employmentTypePreferenceJson,
    preferredSourcesJson, excludedSourcesJson, ...rest
  } = p;
  return {
    ...rest,
    targetRoles: targetRolesJson ?? [],
    targetCompanies: targetCompaniesJson ?? [],
    blockedCompanies: blockedCompaniesJson ?? [],
    locations: locationsJson ?? [],
    acceptableAdjacentRoles: acceptableAdjacentRolesJson ?? [],
    excludedRoles: excludedRolesJson ?? [],
    employmentTypePreference: employmentTypePreferenceJson ?? [],
    preferredSources: preferredSourcesJson ?? [],
    excludedSources: excludedSourcesJson ?? [],
  };
}

profileRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const [profile, preferences] = await Promise.all([getProfile(userId), getPreferences(userId)]);
  res.json({
    profile: formatProfile(profile as Record<string, unknown> | null),
    preferences: formatPreferences(preferences as Record<string, unknown> | null),
  });
}));

profileRouter.put("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid profile data", errors: parsed.error.issues });
    return;
  }
  const userId = req.userId!;
  const profile = await upsertProfile(userId, parsed.data as Parameters<typeof upsertProfile>[1]);
  logger.info({ userId }, "Profile updated");
  res.json({ profile: formatProfile(profile as Record<string, unknown>) });
}));

profileRouter.put("/preferences", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid preferences data" });
    return;
  }
  const userId = req.userId!;
  const prefs = await upsertPreferences(userId, parsed.data);
  logger.info({ userId }, "Preferences updated");
  res.json({ preferences: formatPreferences(prefs as Record<string, unknown>) });
}));
