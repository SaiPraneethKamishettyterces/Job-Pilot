-- Per-job cost attribution on the global pool.
ALTER TABLE "JobPosting" ADD COLUMN "acquisitionCostUsd" DOUBLE PRECISION;
ALTER TABLE "JobPosting" ADD COLUMN "embedCostUsd" DOUBLE PRECISION;

-- Explorer/expenses indexes.
CREATE INDEX "JobPosting_sourceName_idx" ON "JobPosting"("sourceName");
CREATE INDEX "JobPosting_firstSeenAt_idx" ON "JobPosting"("firstSeenAt");

-- Per-run cost on the ingestion run.
ALTER TABLE "GlobalIngestRun" ADD COLUMN "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "GlobalIngestRun" ADD COLUMN "embedCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "GlobalIngestRun" ADD COLUMN "callCount" INTEGER NOT NULL DEFAULT 0;

-- Per-call scraper ledger.
CREATE TABLE "ScraperUsageEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT,
    "kind" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "actorName" TEXT,
    "query" TEXT,
    "itemsReturned" INTEGER NOT NULL DEFAULT 0,
    "itemsNew" INTEGER NOT NULL DEFAULT 0,
    "itemsDuplicate" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "estimated" BOOLEAN NOT NULL DEFAULT false,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ok',
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScraperUsageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ScraperUsageEvent_source_createdAt_idx" ON "ScraperUsageEvent"("source", "createdAt");
CREATE INDEX "ScraperUsageEvent_runId_idx" ON "ScraperUsageEvent"("runId");
CREATE INDEX "ScraperUsageEvent_createdAt_idx" ON "ScraperUsageEvent"("createdAt");

ALTER TABLE "ScraperUsageEvent" ADD CONSTRAINT "ScraperUsageEvent_runId_fkey"
    FOREIGN KEY ("runId") REFERENCES "GlobalIngestRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Daily storage snapshot.
CREATE TABLE "StorageDailyMetric" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "bytesTotal" BIGINT NOT NULL DEFAULT 0,
    "bytesHeap" BIGINT NOT NULL DEFAULT 0,
    "bytesIndex" BIGINT NOT NULL DEFAULT 0,
    "bytesToast" BIGINT NOT NULL DEFAULT 0,
    "rowCount" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StorageDailyMetric_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "StorageDailyMetric_date_scope_key_key" ON "StorageDailyMetric"("date", "scope", "key");
CREATE INDEX "StorageDailyMetric_scope_date_idx" ON "StorageDailyMetric"("scope", "date");
