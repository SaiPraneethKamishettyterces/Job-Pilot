-- Admin auth flag, per-source scraper config (paid Apify track), registry params,
-- and a source tag on global ingest runs. All additive.

ALTER TABLE "User" ADD COLUMN "isAdmin" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "JobSource" ADD COLUMN "configJson" JSONB;

ALTER TABLE "GlobalIngestRun" ADD COLUMN "sourceTag" TEXT NOT NULL DEFAULT 'free';

CREATE TABLE "ScraperSourceConfig" (
    "id" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "maxJobsPerRun" INTEGER NOT NULL DEFAULT 25,
    "notesJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperSourceConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ScraperSourceConfig_sourceKey_key" ON "ScraperSourceConfig"("sourceKey");
