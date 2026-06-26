-- Cost-factor drill-down: measured token split per Claude call (input factors /
-- output sections), apportioned to the billed totals. Nullable — only resume
-- tailoring records it. Schema field added on the Claude-cost-dashboard branch
-- without a migration; this backfills it so the merged schema is deploy-consistent.
ALTER TABLE "AIUsageEvent" ADD COLUMN "breakdownJson" JSONB;
