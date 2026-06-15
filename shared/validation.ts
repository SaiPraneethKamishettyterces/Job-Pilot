import { z } from "zod";

// Single source of truth for request-payload validation, imported by BOTH the
// Express server (boundary validation) and the React client (form validation).
// Keep this file dependency-free except for `zod` so it resolves cleanly under
// the server's NodeNext build and the client's bundler resolution.

// ─── Auth ──────────────────────────────────────────────────────────────────

export const signupSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(2, "Name must be at least 2 characters"),
});
export type SignupInput = z.infer<typeof signupSchema>;

// NOTE: login intentionally allows any non-empty password (min 1) so existing
// users created before stricter rules can still authenticate. The client login
// form may layer a stricter min for UX, but the server contract is this.
export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const updateNameSchema = z.object({ name: z.string().min(2).optional() });

// ─── Onboarding ──────────────────────────────────────────────────────────────

export const approvalModeEnum = z.enum([
  "AUTO_APPLY",
  "ASSISTED_APPLY",
  "ALWAYS_REVIEW",
  "DRAFT_ONLY",
]);

export const onboardingSchema = z.object({
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
  approvalMode: approvalModeEnum,
  matchThreshold: z.number().min(50).max(95),
});
export type OnboardingInput = z.infer<typeof onboardingSchema>;

// ─── Profile ──────────────────────────────────────────────────────────────────

export const profileSchema = z.object({
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
export type ProfileFormInput = z.infer<typeof profileSchema>;

export const preferencesSchema = z.object({
  targetRoles: z.array(z.string()).optional(),
  targetCompanies: z.array(z.string()).optional(),
  blockedCompanies: z.array(z.string()).optional(),
  locations: z.array(z.string()).optional(),
  remotePreference: z.string().optional(),
  minSalary: z.number().optional(),
  maxSalary: z.number().optional(),
  applicationsPerDay: z.number().min(1).max(50).optional(),
  approvalMode: approvalModeEnum.optional(),
  matchThreshold: z.number().min(50).max(95).optional(),
});
export type PreferencesFormInput = z.infer<typeof preferencesSchema>;

// ─── Jobs ──────────────────────────────────────────────────────────────────────

export const addJobSchema = z
  .object({
    jobUrl: z.string().url().optional(),
    rawText: z.string().min(50).optional(),
  })
  .refine((d) => d.jobUrl || d.rawText, {
    message: "Provide either jobUrl or rawText",
  });
export type AddJobInput = z.infer<typeof addJobSchema>;

// ─── Applications ──────────────────────────────────────────────────────────────

export const applicationUpdateSchema = z.object({
  status: z.string().optional(),
  notes: z.string().optional(),
  followUpDate: z.string().datetime().optional().nullable(),
  hiringManagerEmail: z.string().email().optional(),
});
export type ApplicationUpdateInput = z.infer<typeof applicationUpdateSchema>;
