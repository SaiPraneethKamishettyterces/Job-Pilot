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

// Generic, reusable application fields — the answers common ATS forms ask, stored
// once on the user profile. All optional (the user fills what they want); names
// default from `fullName`. Role-specific answers are handled per-application.
// Fields are `.nullish()` (optional + nullable) so editing surfaces can either
// omit a key (leave as-is) or send `null` to explicitly clear it. Consent is a
// non-nullable boolean column, so it stays `.optional()` only.
export const genericProfileFields = {
  // identity
  legalFirstName: z.string().nullish(),
  legalLastName: z.string().nullish(),
  preferredName: z.string().nullish(),
  // address
  addressLine1: z.string().nullish(),
  addressLine2: z.string().nullish(),
  city: z.string().nullish(),
  state: z.string().nullish(),
  zipCode: z.string().nullish(),
  country: z.string().nullish(),
  personalWebsite: z.string().nullish(),
  // work auth
  requiresSponsorship: z.boolean().nullish(),
  visaStatus: z.string().nullish(),
  // employment
  currentEmployer: z.string().nullish(),
  currentTitle: z.string().nullish(),
  // education
  highestEducation: z.string().nullish(),
  school: z.string().nullish(),
  degree: z.string().nullish(),
  major: z.string().nullish(),
  graduationYear: z.string().nullish(),
  // logistics
  willingToRelocate: z.boolean().nullish(),
  noticePeriod: z.string().nullish(),
  availabilityToStart: z.string().nullish(),
  desiredSalary: z.string().nullish(),
  coverLetterPreference: z.string().nullish(),
  // sourcing
  howHeard: z.string().nullish(),
  referralName: z.string().nullish(),
  referralSource: z.string().nullish(),
  // EEO (voluntary)
  gender: z.string().nullish(),
  raceEthnicity: z.string().nullish(),
  veteranStatus: z.string().nullish(),
  disabilityStatus: z.string().nullish(),
  // consent
  consentToDataProcessing: z.boolean().optional(),
} as const;

export const onboardingSchema = z.object({
  fullName: z.string().min(2),
  phone: z.string().optional(),
  location: z.string().optional(),
  linkedinUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  portfolioUrl: z.string().optional(),
  workAuthorization: z.string().optional(),
  yearsExperience: z.number().min(0).max(60).optional(),
  targetRoles: z.array(z.string()),
  targetCompanies: z.array(z.string()),
  blockedCompanies: z.array(z.string()),
  locations: z.array(z.string()),
  remotePreference: z.string(),
  minSalary: z.number().min(0).max(10_000_000).optional(),
  applicationsPerDay: z.number().min(1).max(50),
  approvalMode: approvalModeEnum,
  matchThreshold: z.number().min(50).max(95),
  ...genericProfileFields,
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
  ...genericProfileFields,
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

// Batch question-answering. Bounded to prevent unbounded AI fan-out / token burn.
export const answerQuestionsSchema = z.object({
  questions: z.array(z.string().trim().min(1).max(2000)).min(1).max(50),
});
export type AnswerQuestionsInput = z.infer<typeof answerQuestionsSchema>;

// ─── Claude (interactive cover-letter / token-count) ─────────────────────────

export const claudeApplySchema = z.object({
  jobDescription: z.string().min(1).max(20000),
  userProfile: z.object({
    name: z.string().max(200),
    skills: z.array(z.string().max(100)).max(100),
    experience: z.string().max(10000),
    targetRole: z.string().max(200).optional(),
  }),
  tone: z.enum(["professional", "friendly", "concise"]).optional(),
});
export type ClaudeApplyInput = z.infer<typeof claudeApplySchema>;
