import { describe, it, expect, afterAll } from "vitest";
import { putArtifact, getArtifact, storageBackend } from "./artifact-storage.js";
import { prisma } from "../../lib/db.js";

// Integration test: exercises the real Postgres artifact backend end-to-end.
// Requires a reachable DATABASE_URL. Excluded from the default `npm test` run
// (CI has no DB); run with `npm run test:integration`.

const PREFIX = "applications/_itest_user/_itest_job";
const KEY = `${PREFIX}/tailored_resume.docx`;

describe("artifact-storage (Postgres, integration)", () => {
  afterAll(async () => {
    await prisma.artifact.deleteMany({ where: { key: { startsWith: "applications/_itest_" } } });
    await prisma.$disconnect();
  });

  it("uses the Postgres backend", () => {
    expect(storageBackend).toBe("postgres");
  });

  it("round-trips bytes through the database", async () => {
    const payload = Buffer.from("INTEGRATION_ARTIFACT_" + "y".repeat(200));
    const stored = await putArtifact(KEY, payload);
    expect(stored.key).toBe(KEY);
    expect(stored.bytes).toBe(payload.length);
    expect(stored.downloadPath).toBe(`/api/files/${KEY}`);

    const read = await getArtifact(KEY);
    expect(read).not.toBeNull();
    expect(read!.equals(payload)).toBe(true);
  });

  it("derives userId from the key layout", async () => {
    await putArtifact(KEY, Buffer.from("x"));
    const row = await prisma.artifact.findUnique({ where: { key: KEY }, select: { userId: true } });
    expect(row?.userId).toBe("_itest_user");
  });

  it("overwrites on re-put (upsert, not duplicate)", async () => {
    await putArtifact(KEY, Buffer.from("v1"));
    await putArtifact(KEY, Buffer.from("v2-longer-content"));
    const read = await getArtifact(KEY);
    expect(read!.toString()).toBe("v2-longer-content");
    const count = await prisma.artifact.count({ where: { key: KEY } });
    expect(count).toBe(1);
  });

  it("returns null for a missing key", async () => {
    expect(await getArtifact(`${PREFIX}/does-not-exist.docx`)).toBeNull();
  });
});
