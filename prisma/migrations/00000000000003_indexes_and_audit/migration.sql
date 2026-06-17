-- Performance indexes backing the billing/usage aggregations.
CREATE INDEX "Application_userId_status_createdAt_idx" ON "Application"("userId", "status", "createdAt");
CREATE INDEX "AIUsageEvent_userId_createdAt_idx" ON "AIUsageEvent"("userId", "createdAt");
CREATE INDEX "AIUsageEvent_createdAt_idx" ON "AIUsageEvent"("createdAt");

-- Append-only audit log for sensitive account operations. No FK on userId so the
-- record survives the user's deletion (defensible GDPR deletion trail).
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AuditLog_userId_createdAt_idx" ON "AuditLog"("userId", "createdAt");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
