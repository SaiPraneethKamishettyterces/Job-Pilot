-- Per-day application cap on the plan, so tiers (30/50/75 per day) drive the
-- pipeline's daily limit instead of a per-user preference default.
ALTER TABLE "Plan" ADD COLUMN "applicationsPerDay" INTEGER NOT NULL DEFAULT 10;
