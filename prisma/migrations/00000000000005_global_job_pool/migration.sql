-- Global job pool + two-stage retrieval.
--
-- Decouples ingestion (shared, scheduled, user-agnostic) from matching (per-user).
-- Introduces a single deduped JobPosting pool with pgvector embeddings for ANN
-- candidate retrieval, and turns the per-user "Job" row into a thin handle that
-- references the pool (postingId) or holds a manually pasted job (postingId NULL).
--
-- This migration is hand-authored: `prisma migrate` cannot emit CREATE EXTENSION
-- or the HNSW ANN index for the Unsupported("vector(768)") column.

-- pgvector extension (Cloud SQL: enable the `vector` flag / `CREATE EXTENSION`).
CREATE EXTENSION IF NOT EXISTS vector;

-- ─── Global pool ─────────────────────────────────────────────────────────────
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "sourceName" TEXT,
    "sourceJobId" TEXT,
    "atsPlatform" TEXT,
    "jobUrl" TEXT,
    "applyUrl" TEXT,
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
    "embedding" vector(768),
    "embeddedAt" TIMESTAMP(3),
    "embedModel" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "contentHash" TEXT,
    "postingStatus" TEXT,
    "postedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ingestRunId" TEXT,
    "rawJson" JSONB,
    "schemaVersion" TEXT DEFAULT 'global.v1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "JobPosting_dedupeKey_key" ON "JobPosting"("dedupeKey");
CREATE INDEX "JobPosting_company_idx" ON "JobPosting"("company");
CREATE INDEX "JobPosting_postingStatus_postedAt_idx" ON "JobPosting"("postingStatus", "postedAt");
CREATE INDEX "JobPosting_remoteType_idx" ON "JobPosting"("remoteType");

-- ANN index for cosine-distance candidate retrieval (`embedding <=> queryVec`).
CREATE INDEX "JobPosting_embedding_hnsw_idx"
    ON "JobPosting" USING hnsw ("embedding" vector_cosine_ops);

ALTER TABLE "JobPosting"
    ADD CONSTRAINT "JobPosting_sourceId_fkey"
    FOREIGN KEY ("sourceId") REFERENCES "JobSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── Pool-level ingestion run metrics ────────────────────────────────────────
CREATE TABLE "GlobalIngestRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'CREATED',
    "boardsFetched" INTEGER NOT NULL DEFAULT 0,
    "postingsDiscovered" INTEGER NOT NULL DEFAULT 0,
    "postingsInserted" INTEGER NOT NULL DEFAULT 0,
    "postingsUpdated" INTEGER NOT NULL DEFAULT 0,
    "postingsEmbedded" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GlobalIngestRun_pkey" PRIMARY KEY ("id")
);

-- ─── Per-user Job becomes a thin handle into the pool ────────────────────────
-- Pre-production assumption: no Job/JobMatch/Application data worth preserving.
-- The old per-user dedup key is dropped in favor of (userId, postingId). If this
-- runs against data, truncate Job/JobMatch/Application first (verify before drop).
DROP INDEX IF EXISTS "Job_userId_dedupeKey_key";

ALTER TABLE "Job" DROP COLUMN IF EXISTS "embeddingJson";
ALTER TABLE "Job" ADD COLUMN "postingId" TEXT;

ALTER TABLE "Job"
    ADD CONSTRAINT "Job_postingId_fkey"
    FOREIGN KEY ("postingId") REFERENCES "JobPosting"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Job_userId_postingId_key" ON "Job"("userId", "postingId");

-- ─── Two-stage retrieval provenance on JobMatch (additive) ───────────────────
ALTER TABLE "JobMatch" ADD COLUMN "stage" TEXT;
ALTER TABLE "JobMatch" ADD COLUMN "vectorScore" DOUBLE PRECISION;
ALTER TABLE "JobMatch" ADD COLUMN "featureScore" DOUBLE PRECISION;
