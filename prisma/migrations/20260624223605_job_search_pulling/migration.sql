-- DropIndex
DROP INDEX "JobPosting_embedding_hnsw_idx";

-- AlterTable
ALTER TABLE "ApplicationRun" ADD COLUMN     "gateFailuresJson" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN     "jobsGated" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "JobMatch" ADD COLUMN     "atsScore" INTEGER,
ADD COLUMN     "compensationScore" INTEGER,
ADD COLUMN     "domainScore" INTEGER,
ADD COLUMN     "experienceFitScore" INTEGER,
ADD COLUMN     "failedGatesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "feasibilityScore" INTEGER,
ADD COLUMN     "gateStatus" TEXT,
ADD COLUMN     "locationScore" INTEGER,
ADD COLUMN     "reasonCodesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "recencyScore" INTEGER,
ADD COLUMN     "roleFitScore" INTEGER,
ADD COLUMN     "skillScore" INTEGER,
ADD COLUMN     "statusTier" TEXT,
ADD COLUMN     "workAuthScore" INTEGER;

-- AlterTable
ALTER TABLE "JobPosting" ADD COLUMN     "canonicalKey" TEXT,
ADD COLUMN     "companyCareerUrl" TEXT,
ADD COLUMN     "primarySource" TEXT,
ADD COLUMN     "sourceCount" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "UserPreference" ADD COLUMN     "acceptableAdjacentRolesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "employmentTypePreferenceJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "excludedRolesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "excludedSourcesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "preferredSourcesJson" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "cloudPlatformsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "domainsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "industriesJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "secondarySkillsJson" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "seniorityBand" TEXT,
ADD COLUMN     "toolsJson" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "AdminSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "SourceDailyMetrics" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "actorName" TEXT,
    "totalScraped" INTEGER NOT NULL DEFAULT 0,
    "totalNew" INTEGER NOT NULL DEFAULT 0,
    "totalDuplicates" INTEGER NOT NULL DEFAULT 0,
    "jobsHighMatch" INTEGER NOT NULL DEFAULT 0,
    "jobsSelected" INTEGER NOT NULL DEFAULT 0,
    "applied" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actorRuns" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceDailyMetrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SourceDailyMetrics_date_idx" ON "SourceDailyMetrics"("date");

-- CreateIndex
CREATE UNIQUE INDEX "SourceDailyMetrics_date_source_key" ON "SourceDailyMetrics"("date", "source");
