-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ApprovalMode" AS ENUM ('AUTO_APPLY', 'ASSISTED_APPLY', 'ALWAYS_REVIEW', 'DRAFT_ONLY');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('CREATED', 'DISCOVERING_JOBS', 'PARSING_JOBS', 'SCORING', 'GENERATING_DOCUMENTS', 'WAITING_FOR_APPROVAL', 'APPLYING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('DISCOVERED', 'SHORTLISTED', 'MATCHED', 'GENERATED', 'TAILORED_RESUME_READY', 'NEEDS_APPROVAL', 'APPROVED', 'APPLICATION_STARTED', 'FORM_FILLED_READY_TO_SUBMIT', 'READY_FOR_USER_SUBMIT', 'APPLIED', 'ASSISTED_REQUIRED', 'CAPTCHA_REQUIRED', 'LOGIN_REQUIRED', 'QUESTION_NEEDS_REVIEW', 'DRAFT_ONLY', 'DECLINED', 'FAILED', 'FAILED_TECHNICAL', 'SKIPPED_UNSUPPORTED', 'ARCHIVED', 'FOLLOW_UP_DUE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "passwordHash" TEXT,
    "authProviderId" TEXT,
    "avatarUrl" TEXT,
    "onboardingDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "legalFirstName" TEXT,
    "legalLastName" TEXT,
    "preferredName" TEXT,
    "phone" TEXT,
    "location" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "country" TEXT,
    "linkedinUrl" TEXT,
    "githubUrl" TEXT,
    "portfolioUrl" TEXT,
    "personalWebsite" TEXT,
    "workAuthorization" TEXT,
    "requiresSponsorship" BOOLEAN,
    "visaStatus" TEXT,
    "currentEmployer" TEXT,
    "currentTitle" TEXT,
    "yearsExperience" INTEGER,
    "highestEducation" TEXT,
    "school" TEXT,
    "degree" TEXT,
    "major" TEXT,
    "graduationYear" TEXT,
    "willingToRelocate" BOOLEAN,
    "noticePeriod" TEXT,
    "availabilityToStart" TEXT,
    "desiredSalary" TEXT,
    "coverLetterPreference" TEXT,
    "howHeard" TEXT,
    "referralName" TEXT,
    "referralSource" TEXT,
    "gender" TEXT,
    "raceEthnicity" TEXT,
    "veteranStatus" TEXT,
    "disabilityStatus" TEXT,
    "consentToDataProcessing" BOOLEAN NOT NULL DEFAULT false,
    "consentAt" TIMESTAMP(3),
    "summary" TEXT,
    "skillsJson" JSONB NOT NULL DEFAULT '[]',
    "educationJson" JSONB NOT NULL DEFAULT '[]',
    "experienceJson" JSONB NOT NULL DEFAULT '[]',
    "projectsJson" JSONB NOT NULL DEFAULT '[]',
    "certificationsJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "targetRolesJson" JSONB NOT NULL DEFAULT '[]',
    "targetCompaniesJson" JSONB NOT NULL DEFAULT '[]',
    "blockedCompaniesJson" JSONB NOT NULL DEFAULT '[]',
    "locationsJson" JSONB NOT NULL DEFAULT '[]',
    "remotePreference" TEXT NOT NULL DEFAULT 'any',
    "minSalary" INTEGER,
    "maxSalary" INTEGER,
    "yearsExperienceTarget" INTEGER,
    "applicationsPerDay" INTEGER NOT NULL DEFAULT 10,
    "approvalMode" "ApprovalMode" NOT NULL DEFAULT 'ALWAYS_REVIEW',
    "matchThreshold" INTEGER NOT NULL DEFAULT 70,
    "atsPreferencesJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Resume" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "originalFileUrl" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "rawText" TEXT,
    "parsedJson" JSONB,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Resume_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResumeVersion" (
    "id" TEXT NOT NULL,
    "resumeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ResumeVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobSource" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT,
    "platform" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "runId" TEXT,
    "sourceId" TEXT,
    "sourceName" TEXT,
    "sourceJobId" TEXT,
    "externalId" TEXT,
    "jobUrl" TEXT,
    "applyUrl" TEXT,
    "atsPlatform" TEXT,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT,
    "company" TEXT NOT NULL,
    "companyDomain" TEXT,
    "department" TEXT,
    "industry" TEXT,
    "location" TEXT,
    "isRemote" BOOLEAN,
    "remoteType" TEXT,
    "employmentType" TEXT,
    "seniority" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "salaryCurrency" TEXT,
    "salaryPeriod" TEXT,
    "salaryTextRaw" TEXT,
    "visaSponsored" BOOLEAN,
    "workAuthorization" TEXT,
    "sponsorshipNotes" TEXT,
    "description" TEXT,
    "descriptionClean" TEXT,
    "requirementsJson" JSONB NOT NULL DEFAULT '[]',
    "skillsJson" JSONB NOT NULL DEFAULT '[]',
    "toolsJson" JSONB NOT NULL DEFAULT '[]',
    "experienceMin" INTEGER,
    "experienceMax" INTEGER,
    "embeddingJson" JSONB,
    "dedupeKey" TEXT,
    "contentHash" TEXT,
    "postingStatus" TEXT,
    "postedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "ingestedAt" TIMESTAMP(3),
    "rawJson" JSONB,
    "schemaVersion" TEXT DEFAULT 't2.v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobMatch" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "decision" TEXT NOT NULL,
    "reasonsJson" JSONB NOT NULL DEFAULT '[]',
    "risksJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'CREATED',
    "triggerType" TEXT,
    "requestedSourcesJson" JSONB NOT NULL DEFAULT '[]',
    "jobsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "jobsInserted" INTEGER NOT NULL DEFAULT 0,
    "jobsUpdated" INTEGER NOT NULL DEFAULT 0,
    "duplicatesSkipped" INTEGER NOT NULL DEFAULT 0,
    "jobsShortlisted" INTEGER NOT NULL DEFAULT 0,
    "applicationsTotal" INTEGER NOT NULL DEFAULT 0,
    "applicationsDone" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApplicationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Application" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "jobId" TEXT,
    "resumeId" TEXT,
    "company" TEXT NOT NULL,
    "roleTitle" TEXT NOT NULL,
    "jobUrl" TEXT,
    "atsPlatform" TEXT,
    "matchScore" INTEGER,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'DISCOVERED',
    "applyMode" "ApprovalMode",
    "tailoredResumeUrl" TEXT,
    "coverLetterUrl" TEXT,
    "coldEmailText" TEXT,
    "hiringManagerEmail" TEXT,
    "submissionConfirmation" TEXT,
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "followUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Application_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationDocument" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fileUrl" TEXT,
    "content" TEXT,
    "metadataJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationAnswer" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "answer" TEXT NOT NULL,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "approved" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecruiterContact" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "name" TEXT,
    "title" TEXT,
    "email" TEXT,
    "linkedinUrl" TEXT,
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApplicationEvent" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApplicationEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsageEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "runId" TEXT,
    "applicationId" TEXT,
    "featureName" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "estimatedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "priceMonthly" DOUBLE PRECISION NOT NULL,
    "priceYearly" DOUBLE PRECISION,
    "applicationsPerMonth" INTEGER NOT NULL,
    "tailoringsPerMonth" INTEGER NOT NULL,
    "automationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "analyticsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "featuresJson" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "paymentProvider" TEXT NOT NULL DEFAULT 'test',
    "stripeCustomerId" TEXT,
    "stripeSubId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "paymentProvider" TEXT NOT NULL,
    "paymentCustomerId" TEXT,
    "subscriptionId" TEXT,
    "eventType" TEXT NOT NULL,
    "oldStatus" TEXT,
    "newStatus" TEXT,
    "planName" TEXT,
    "amountPaid" DOUBLE PRECISION,
    "currency" TEXT,
    "processingStatus" TEXT NOT NULL DEFAULT 'processed',
    "rawEventJson" JSONB,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_authProviderId_key" ON "User"("authProviderId");

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_userId_key" ON "UserProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreference_userId_key" ON "UserPreference"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "JobSource_name_key" ON "JobSource"("name");

-- CreateIndex
CREATE INDEX "Job_userId_runId_idx" ON "Job"("userId", "runId");

-- CreateIndex
CREATE INDEX "Job_company_idx" ON "Job"("company");

-- CreateIndex
CREATE UNIQUE INDEX "Job_userId_dedupeKey_key" ON "Job"("userId", "dedupeKey");

-- CreateIndex
CREATE UNIQUE INDEX "JobMatch_jobId_userId_key" ON "JobMatch"("jobId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_slug_key" ON "Plan"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_userId_key" ON "Subscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubId_key" ON "Subscription"("stripeSubId");

-- CreateIndex
CREATE INDEX "SubscriptionEvent_userId_newStatus_idx" ON "SubscriptionEvent"("userId", "newStatus");

-- AddForeignKey
ALTER TABLE "UserProfile" ADD CONSTRAINT "UserProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreference" ADD CONSTRAINT "UserPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Resume" ADD CONSTRAINT "Resume_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResumeVersion" ADD CONSTRAINT "ResumeVersion_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ApplicationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobMatch" ADD CONSTRAINT "JobMatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationRun" ADD CONSTRAINT "ApplicationRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ApplicationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Application" ADD CONSTRAINT "Application_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "Resume"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationDocument" ADD CONSTRAINT "ApplicationDocument_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationAnswer" ADD CONSTRAINT "ApplicationAnswer_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecruiterContact" ADD CONSTRAINT "RecruiterContact_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApplicationEvent" ADD CONSTRAINT "ApplicationEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ApplicationRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsageEvent" ADD CONSTRAINT "AIUsageEvent_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "Application"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionEvent" ADD CONSTRAINT "SubscriptionEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

