import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import {
  getProfile,
  upsertProfile,
  getPreferences,
  upsertPreferences,
} from "../services/profile/profile-service.js";

export const profileRouter = Router();

const profileSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().optional(),
  location: z.string().optional(),
  workAuthorization: z.string().optional(),
  yearsExperience: z.number().min(0).max(50).optional(),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  summary: z.string().optional(),
  skills: z.array(z.object({ name: z.string(), level: z.string().optional() })).optional(),
  education: z.array(z.object({}).passthrough()).optional(),
  experience: z.array(z.object({}).passthrough()).optional(),
  projects: z.array(z.object({}).passthrough()).optional(),
  certifications: z.array(z.string()).optional(),
});

const preferencesSchema = z.object({
  targetRoles: z.array(z.string()).optional(),
  targetCompanies: z.array(z.string()).optional(),
  blockedCompanies: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  remotePreference: z.string().optional(),
  minSalary: z.number().optional(),
  maxSalary: z.number().optional(),
  applicationsPerDay: z.number().min(1).max(50).optional(),
  approvalMode: z.enum(["AUTO_APPLY", "ASSISTED_APPLY", "ALWAYS_REVIEW", "DRAFT_ONLY"]).optional(),
  matchThreshold: z.number().min(50).max(95).optional(),
});

function formatProfile(p: Record<string, unknown> | null) {
  if (!p) return null;
  const { skillsJson, educationJson, experienceJson, projectsJson, certificationsJson, ...rest } = p;
  return {
    ...rest,
    skills: skillsJson ?? [],
    education: educationJson ?? [],
    experience: experienceJson ?? [],
    projects: projectsJson ?? [],
    certifications: certificationsJson ?? [],
  };
}

function formatPreferences(p: Record<string, unknown> | null) {
  if (!p) return null;
  const { targetRolesJson, targetCompaniesJson, blockedCompaniesJson, locationsJson, ...rest } = p;
  return {
    ...rest,
    targetRoles: targetRolesJson ?? [],
    targetCompanies: targetCompaniesJson ?? [],
    blockedCompanies: blockedCompaniesJson ?? [],
    locations: locationsJson ?? [],
  };
}

profileRouter.get("/", requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!;
    const [profile, preferences] = await Promise.all([
      getProfile(userId),
      getPreferences(userId),
    ]);
    res.json({
      profile: formatProfile(profile as Record<string, unknown> | null),
      preferences: formatPreferences(preferences as Record<string, unknown> | null),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({ message: "Database unavailable", detail: msg });
  }
});

profileRouter.put("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid profile data", errors: parsed.error.issues });
    return;
  }
  try {
    const userId = req.userId!;
    const profile = await upsertProfile(userId, parsed.data as Parameters<typeof upsertProfile>[1]);
    logger.info({ userId }, "Profile updated");
    res.json({ profile: formatProfile(profile as Record<string, unknown>) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({ message: "Database unavailable", detail: msg });
  }
});

profileRouter.put("/preferences", requireAuth, async (req: AuthRequest, res) => {
  const parsed = preferencesSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid preferences data" });
    return;
  }
  try {
    const userId = req.userId!;
    const prefs = await upsertPreferences(userId, parsed.data);
    logger.info({ userId }, "Preferences updated");
    res.json({ preferences: formatPreferences(prefs as Record<string, unknown>) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({ message: "Database unavailable", detail: msg });
  }
});
