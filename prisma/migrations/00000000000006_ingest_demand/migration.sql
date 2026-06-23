-- Demand-driven ingestion: record how many aggregated role-keywords steered the
-- search APIs (Adzuna/USAJOBS) in a global ingest cycle. Additive, non-breaking.
ALTER TABLE "GlobalIngestRun" ADD COLUMN "keywordsUsed" INTEGER NOT NULL DEFAULT 0;
