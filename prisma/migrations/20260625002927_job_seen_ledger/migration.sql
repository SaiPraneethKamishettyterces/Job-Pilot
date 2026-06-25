-- CreateTable
CREATE TABLE "JobSeen" (
    "canonicalKey" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "timesSeen" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobSeen_pkey" PRIMARY KEY ("canonicalKey")
);

-- CreateTable
CREATE TABLE "UserJobSeen" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "canonicalKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'shown',
    "firstShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastShownAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJobSeen_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobSeen_lastSeenAt_idx" ON "JobSeen"("lastSeenAt");

-- CreateIndex
CREATE INDEX "UserJobSeen_userId_idx" ON "UserJobSeen"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserJobSeen_userId_canonicalKey_key" ON "UserJobSeen"("userId", "canonicalKey");

-- AddForeignKey
ALTER TABLE "UserJobSeen" ADD CONSTRAINT "UserJobSeen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill the durable novelty ledger from the existing pool so de-dup/novelty is
-- consistent immediately. Uses the EARLIEST firstSeenAt per canonicalKey.
INSERT INTO "JobSeen" ("canonicalKey","firstSeenAt","lastSeenAt","timesSeen","createdAt","updatedAt")
SELECT "canonicalKey", MIN("firstSeenAt"), MAX("lastSeenAt"), COUNT(*)::int, now(), now()
FROM "JobPosting" WHERE "canonicalKey" IS NOT NULL
GROUP BY "canonicalKey"
ON CONFLICT ("canonicalKey") DO NOTHING;
