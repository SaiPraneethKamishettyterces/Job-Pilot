-- Registry verification/health fields: drive crawl rotation (least-recently-checked
-- first) and auto-deactivation of dead boards. All additive.
ALTER TABLE "JobSource" ADD COLUMN "lastCheckedAt" TIMESTAMP(3);
ALTER TABLE "JobSource" ADD COLUMN "lastSuccessAt" TIMESTAMP(3);
ALTER TABLE "JobSource" ADD COLUMN "activeJobCount" INTEGER;

CREATE INDEX "JobSource_isActive_lastCheckedAt_idx" ON "JobSource"("isActive", "lastCheckedAt");
