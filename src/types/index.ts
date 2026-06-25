// ─── Auth ────────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  isAdmin?: boolean;
  onboardingDone: boolean;
  emailVerified?: boolean;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isLoading: boolean;
}

// ─── Profile ─────────────────────────────────────────────────────────────────

export interface Skill {
  name: string;
  level?: "beginner" | "intermediate" | "advanced" | "expert";
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startYear: number;
  endYear?: number;
  gpa?: string;
}

export interface WorkExperience {
  company: string;
  title: string;
  location?: string;
  startDate: string;
  endDate?: string;
  isCurrent: boolean;
  description: string;
  achievements?: string[];
}

export interface Project {
  name: string;
  description: string;
  url?: string;
  technologies?: string[];
}

export interface UserProfile {
  id: string;
  userId: string;
  fullName: string;
  phone?: string;
  location?: string;
  workAuthorization?: string;
  yearsExperience?: number;
  linkedinUrl?: string;
  githubUrl?: string;
  portfolioUrl?: string;
  summary?: string;
  skills: Skill[];
  education: Education[];
  experience: WorkExperience[];
  projects: Project[];
  certifications: string[];
  // Generic ATS application details (filled once, reused on every application).
  legalFirstName?: string;
  legalLastName?: string;
  preferredName?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  personalWebsite?: string;
  requiresSponsorship?: boolean;
  visaStatus?: string;
  currentEmployer?: string;
  currentTitle?: string;
  highestEducation?: string;
  school?: string;
  degree?: string;
  major?: string;
  graduationYear?: string;
  willingToRelocate?: boolean;
  noticePeriod?: string;
  availabilityToStart?: string;
  desiredSalary?: string;
  coverLetterPreference?: string;
  howHeard?: string;
  referralName?: string;
  referralSource?: string;
  // EEO (voluntary)
  gender?: string;
  raceEthnicity?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  consentToDataProcessing?: boolean;
  consentAt?: string;
}

export interface UserPreference {
  id: string;
  userId: string;
  targetRoles: string[];
  targetCompanies: string[];
  blockedCompanies: string[];
  locations: string[];
  remotePreference: "remote" | "hybrid" | "onsite" | "any";
  minSalary?: number;
  maxSalary?: number;
  applicationsPerDay: number;
  approvalMode: "AUTO_APPLY" | "ASSISTED_APPLY" | "ALWAYS_REVIEW" | "DRAFT_ONLY";
  matchThreshold: number;
}

// ─── Resume ──────────────────────────────────────────────────────────────────

export interface Resume {
  id: string;
  userId: string;
  fileName: string;
  originalFileUrl: string;
  fileType: string;
  parsedJson?: UserProfile;
  isPrimary: boolean;
  version: number;
  createdAt: string;
}

// ─── Job ─────────────────────────────────────────────────────────────────────

export interface Job {
  id: string;
  title: string;
  company: string;
  location?: string;
  isRemote?: boolean;
  salaryMin?: number;
  salaryMax?: number;
  description?: string;
  skills: string[];
  atsPlatform?: string;
  jobUrl?: string;
  postedAt?: string;
}

export interface JobMatch {
  jobId: string;
  score: number;
  decision: "SHORTLIST" | "REVIEW" | "SKIP";
  reasons: string[];
  risks: string[];
}

// ─── Application ─────────────────────────────────────────────────────────────

export type ApplicationStatus =
  | "DISCOVERED"
  | "SHORTLISTED"
  | "MATCHED"
  | "GENERATED"
  | "TAILORED_RESUME_READY"
  | "NEEDS_APPROVAL"
  | "APPROVED"
  | "APPLICATION_STARTED"
  | "FORM_FILLED_READY_TO_SUBMIT"
  | "READY_FOR_USER_SUBMIT"
  | "APPLIED"
  | "ASSISTED_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "LOGIN_REQUIRED"
  | "QUESTION_NEEDS_REVIEW"
  | "DRAFT_ONLY"
  | "DECLINED"
  | "FAILED"
  | "FAILED_TECHNICAL"
  | "SKIPPED_UNSUPPORTED"
  | "ARCHIVED"
  | "FOLLOW_UP_DUE";

export interface Application {
  id: string;
  userId: string;
  runId?: string;
  company: string;
  roleTitle: string;
  jobUrl?: string;
  atsPlatform?: string;
  matchScore?: number;
  status: ApplicationStatus;
  applyMode?: string;
  tailoredResumeUrl?: string;
  coverLetterUrl?: string;
  coldEmailText?: string;
  hiringManagerEmail?: string;
  followUpDate?: string;
  notes?: string;
  appliedAt?: string;
  createdAt: string;
  updatedAt: string;
  /** TEMP(model-badge): model that tailored this app's resume (claude/qwen/fallback). */
  resumeModel?: string | null;
  /** When the linked job posting was scraped/ingested (ISO). For a freshness label. */
  scrapedAt?: string | null;
}

// ─── Run ─────────────────────────────────────────────────────────────────────

export type RunStatus =
  | "CREATED"
  | "DISCOVERING_JOBS"
  | "PARSING_JOBS"
  | "SCORING"
  | "GENERATING_DOCUMENTS"
  | "WAITING_FOR_APPROVAL"
  | "APPLYING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface ApplicationRun {
  id: string;
  userId: string;
  status: RunStatus;
  jobsDiscovered: number;
  jobsShortlisted: number;
  applicationsTotal: number;
  applicationsDone: number;
  errorMessage?: string;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
}

// ─── AI / Tokens ─────────────────────────────────────────────────────────────

export interface TokenSummary {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  estimatedCostUSD: number;
}

// ─── Legacy (keep for existing streaming feature) ────────────────────────────

export interface ApplyRequest {
  jobDescription: string;
  userProfile: { name: string; skills: string[]; experience: string; targetRole?: string };
  tone?: "professional" | "friendly" | "concise";
}

// ─── API ─────────────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
}

// ─── Onboarding ──────────────────────────────────────────────────────────────

export interface OnboardingFormData {
  fullName: string;
  phone: string;
  location: string;
  linkedinUrl: string;
  githubUrl: string;
  portfolioUrl: string;
  workAuthorization: string;
  yearsExperience: number;
  targetRoles: string[];
  targetCompanies: string[];
  blockedCompanies: string[];
  locations: string[];
  remotePreference: string;
  minSalary: number;
  applicationsPerDay: number;
  approvalMode: string;
  matchThreshold: number;
  // Generic ATS application details (filled once, reused on every application)
  legalFirstName?: string;
  legalLastName?: string;
  preferredName?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
  personalWebsite?: string;
  requiresSponsorship?: boolean;
  visaStatus?: string;
  currentEmployer?: string;
  currentTitle?: string;
  highestEducation?: string;
  school?: string;
  degree?: string;
  major?: string;
  graduationYear?: string;
  willingToRelocate?: boolean;
  noticePeriod?: string;
  availabilityToStart?: string;
  desiredSalary?: string;
  coverLetterPreference?: string;
  howHeard?: string;
  referralName?: string;
  // EEO (voluntary)
  gender?: string;
  raceEthnicity?: string;
  veteranStatus?: string;
  disabilityStatus?: string;
  consentToDataProcessing?: boolean;
}
