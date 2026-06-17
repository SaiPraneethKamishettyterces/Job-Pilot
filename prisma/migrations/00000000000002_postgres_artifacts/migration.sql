-- Artifact storage moved into Postgres (single store; replaces GCS / local-fs).
-- Generated document bytes (tailored resumes, packages) now live in the DB so
-- they survive container restarts with no external object store.
CREATE TABLE "Artifact" (
    "key" TEXT NOT NULL,
    "userId" TEXT,
    "mimeType" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Artifact_userId_idx" ON "Artifact"("userId");
