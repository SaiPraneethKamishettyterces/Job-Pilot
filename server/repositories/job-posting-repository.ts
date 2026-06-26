import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db.js";
import type { NormalizedJob } from "../services/ingestion/job-normalizer.js";

// Data access for the global JobPosting pool. The pgvector `embedding` column is
// Prisma-Unsupported, so embedding WRITES and ANN SEARCH go through raw SQL here;
// everything else uses the typed client.

/** Format a JS number[] as a pgvector literal: [0.1,0.2,...] */
function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

export type UpsertResult = { id: string; isNew: boolean; contentChanged: boolean };

/**
 * Resolve the durable global first-sighting for a canonicalKey. Upserts the
 * JobSeen ledger (which OUTLIVES the weekly pool purge) and returns the original
 * firstSeenAt so callers can carry it forward — a still-open job re-pulled after a
 * purge keeps its true first-seen date instead of looking 24h-fresh again. Returns
 * `now` (and skips the ledger) when there's no canonicalKey. Race-safe via the PK
 * upsert; a rare concurrent-insert P2002 is retried once.
 */
async function resolveGlobalFirstSeen(canonicalKey: string | null): Promise<Date> {
  if (!canonicalKey) return new Date();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const seen = await prisma.jobSeen.upsert({
        where: { canonicalKey },
        create: { canonicalKey },
        update: { lastSeenAt: new Date(), timesSeen: { increment: 1 } },
      });
      return seen.firstSeenAt;
    } catch {
      if (attempt === 1) return new Date(); // give up gracefully — novelty defaults to now
    }
  }
  return new Date();
}

/**
 * Upsert a normalized job into the global pool keyed by its global dedupeKey.
 * New posting → insert. Existing → bump lastSeenAt and refresh fields; if the
 * contentHash changed, clear embeddedAt so the embed worker re-embeds it.
 * firstSeenAt is carried forward from the durable JobSeen ledger so it reflects
 * the GLOBAL first sighting (survives the weekly purge), not this row's insert.
 */
export async function upsertPosting(n: NormalizedJob): Promise<UpsertResult> {
  const [existing, firstSeenAt] = await Promise.all([
    prisma.jobPosting.findUnique({
      where: { dedupeKey: n.dedupeKey },
      select: { id: true, contentHash: true },
    }),
    resolveGlobalFirstSeen(n.canonicalKey),
  ]);

  const base = {
    sourceName: n.source,
    sourceJobId: n.sourceJobId,
    atsPlatform: n.atsPlatform,
    title: n.title,
    normalizedTitle: n.normalizedTitle,
    company: n.company,
    department: n.department,
    location: n.location,
    isRemote: n.isRemote,
    remoteType: n.remoteType,
    employmentType: n.employmentType,
    seniority: n.seniority,
    salaryMin: n.salaryMin,
    salaryMax: n.salaryMax,
    salaryCurrency: n.salaryCurrency,
    salaryPeriod: n.salaryPeriod,
    salaryTextRaw: n.salaryTextRaw,
    visaSponsored: n.visaSponsored,
    sponsorshipNotes: n.sponsorshipNotes,
    workAuthorization: n.sponsorshipNotes,
    description: n.descriptionClean.slice(0, 2000),
    descriptionClean: n.descriptionClean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skillsJson: n.skills as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolsJson: n.tools as any,
    jobUrl: n.jobUrl,
    applyUrl: n.applyUrl,
    canonicalKey: n.canonicalKey,
    postedAt: n.postedAt ? new Date(n.postedAt) : null,
    contentHash: n.contentHash,
    postingStatus: "active",
  };

  if (!existing) {
    const row = await prisma.jobPosting.create({
      // firstSeenAt = global first sighting (carried from JobSeen), NOT now() — so a
      // re-pulled-after-purge open job is not re-flagged fresh. acquisitionCostUsd is
      // stamped ONLY here (first insert) — re-sightings must not overwrite it, else a
      // later free re-sighting would zero out a paid job's acquisition cost.
      data: { ...base, dedupeKey: n.dedupeKey, firstSeenAt, lastSeenAt: new Date(), acquisitionCostUsd: n.acquisitionCostUsd },
      select: { id: true },
    });
    return { id: row.id, isNew: true, contentChanged: true };
  }

  const contentChanged = existing.contentHash !== n.contentHash;
  await prisma.jobPosting.update({
    where: { id: existing.id },
    data: {
      ...base,
      firstSeenAt, // re-assert the global first-seen
      lastSeenAt: new Date(),
      // Re-embed only when the content actually changed.
      ...(contentChanged ? { embeddedAt: null } : {}),
    },
  });
  return { id: existing.id, isNew: false, contentChanged };
}

/** Postings still needing an embedding (new, or content changed since last embed). */
export function findUnembedded(limit: number) {
  return prisma.jobPosting.findMany({
    where: { embeddedAt: null },
    select: { id: true, title: true, descriptionClean: true, skillsJson: true },
    take: limit,
  });
}

/**
 * Write a posting's embedding vector via raw SQL (Unsupported column). Also stamps
 * the per-row embedding cost (USD) so total cost per job = acquisition + embed.
 */
export async function writeEmbedding(id: string, vector: number[], model: string, embedCostUsd = 0): Promise<void> {
  const lit = toVectorLiteral(vector);
  await prisma.$executeRaw`
    UPDATE "JobPosting"
    SET "embedding" = ${lit}::vector, "embeddedAt" = now(), "embedModel" = ${model}, "embedCostUsd" = ${embedCostUsd}
    WHERE "id" = ${id}`;
}

export type CandidateFilters = {
  blockedCompanies?: string[]; // lowercased match
  requireRemote?: boolean; // user wants remote-only
  places?: string[]; // location substrings (lowercased), ORed
  minSalary?: number | null;
  requiresSponsorship?: boolean; // exclude postings that explicitly don't sponsor
  freshnessHours?: number; // "daily-new": only postings new (firstSeenAt OR postedAt) within N hours
  excludePostingIds?: string[]; // already-applied / already-materialized
  sourceNamesIn?: string[]; // restrict to these sources (e.g. the Apify bucket)
  sourceNamesNotIn?: string[]; // exclude these sources (e.g. free-plan excludes Apify)
  excludeSeenForUserId?: string; // exclude canonicalKeys this user has already been shown (durable, cross-source)
};

export type PostingCandidate = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  isRemote: boolean | null;
  remoteType: string | null;
  employmentType: string | null;
  seniority: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  description: string | null;
  descriptionClean: string | null;
  requirementsJson: unknown;
  skillsJson: unknown;
  toolsJson: unknown;
  experienceMin: number | null;
  experienceMax: number | null;
  atsPlatform: string | null;
  workAuthorization: string | null;
  jobUrl: string | null;
  applyUrl: string | null;
  postedAt: Date | null;
  sourceName: string | null;
  canonicalKey: string | null;
  vectorScore: number; // cosine similarity in [0,1], higher = closer
};

// Shared hard-filter predicates (everything except the vector/embedding bits), so
// the vector and no-vector retrieval paths apply identical user constraints.
function filterConds(filters: CandidateFilters): Prisma.Sql[] {
  const conds: Prisma.Sql[] = [Prisma.sql`("postingStatus" IS NULL OR "postingStatus" = 'active')`];
  if (filters.freshnessHours && filters.freshnessHours > 0) {
    // "Daily-new": new to our pool (firstSeenAt) OR genuinely posted recently
    // (postedAt). firstSeenAt covers the many sources with null postedAt.
    const h = filters.freshnessHours;
    conds.push(
      Prisma.sql`("firstSeenAt" > now() - ${h} * interval '1 hour' OR ("postedAt" IS NOT NULL AND "postedAt" > now() - ${h} * interval '1 hour'))`,
    );
  }
  if (filters.blockedCompanies?.length) {
    conds.push(Prisma.sql`lower("company") NOT IN (${Prisma.join(filters.blockedCompanies.map((c) => c.toLowerCase()))})`);
  }
  if (filters.requireRemote) {
    conds.push(Prisma.sql`("remoteType" = 'remote' OR "isRemote" = true)`);
  }
  if (filters.places?.length) {
    const placeConds = filters.places.map((p) => Prisma.sql`lower("location") LIKE ${`%${p.toLowerCase()}%`}`);
    conds.push(Prisma.sql`("remoteType" = 'remote' OR "isRemote" = true OR ${Prisma.join(placeConds, " OR ")})`);
  }
  if (filters.minSalary && filters.minSalary > 0) {
    conds.push(Prisma.sql`("salaryMax" IS NULL OR "salaryMax" >= ${filters.minSalary})`);
  }
  if (filters.requiresSponsorship) {
    conds.push(Prisma.sql`("visaSponsored" IS NULL OR "visaSponsored" = true)`);
  }
  if (filters.excludePostingIds?.length) {
    conds.push(Prisma.sql`"id" NOT IN (${Prisma.join(filters.excludePostingIds)})`);
  }
  if (filters.sourceNamesIn?.length) {
    conds.push(Prisma.sql`lower("sourceName") IN (${Prisma.join(filters.sourceNamesIn.map((s) => s.toLowerCase()))})`);
  }
  if (filters.sourceNamesNotIn?.length) {
    conds.push(
      Prisma.sql`("sourceName" IS NULL OR lower("sourceName") NOT IN (${Prisma.join(filters.sourceNamesNotIn.map((s) => s.toLowerCase()))}))`,
    );
  }
  if (filters.excludeSeenForUserId) {
    // Durable, source-agnostic per-user already-shown guard (survives the purge).
    // Index-backed via UserJobSeen @@unique([userId, canonicalKey]). Keyless
    // postings (canonicalKey NULL) fail-open (never excluded here).
    conds.push(
      Prisma.sql`("canonicalKey" IS NULL OR NOT EXISTS (SELECT 1 FROM "UserJobSeen" u WHERE u."userId" = ${filters.excludeSeenForUserId} AND u."canonicalKey" = "JobPosting"."canonicalKey"))`,
    );
  }
  return conds;
}

const CANDIDATE_COLUMNS = Prisma.sql`"id", "title", "company", "location", "isRemote", "remoteType", "employmentType",
  "seniority", "salaryMin", "salaryMax", "salaryCurrency", "description", "descriptionClean",
  "requirementsJson", "skillsJson", "toolsJson", "experienceMin", "experienceMax",
  "atsPlatform", "workAuthorization", "jobUrl", "applyUrl", "postedAt", "sourceName", "canonicalKey"`;

/**
 * Stage-A candidate generation: ANN over the pool by cosine distance to the user
 * query vector, narrowed by hard SQL filters. Returns up to `limit` postings
 * ordered by similarity (closest first).
 */
export async function searchCandidates(
  queryVector: number[],
  filters: CandidateFilters,
  limit: number,
): Promise<PostingCandidate[]> {
  const vec = toVectorLiteral(queryVector);
  const where = Prisma.join([...filterConds(filters), Prisma.sql`"embedding" IS NOT NULL`], " AND ");
  const rows = await prisma.$queryRaw<PostingCandidate[]>`
    SELECT ${CANDIDATE_COLUMNS}, 1 - ("embedding" <=> ${vec}::vector) AS "vectorScore"
    FROM "JobPosting"
    WHERE ${where}
    ORDER BY "embedding" <=> ${vec}::vector
    LIMIT ${limit}`;
  return rows;
}

/**
 * No-AI fallback retrieval: when the pool has no embeddings (no AI provider), match
 * by target-role keywords in the title (when provided) under the same hard filters,
 * ordered by recency. Returns candidates with vectorScore = 0.
 */
export async function searchCandidatesNoVector(
  filters: CandidateFilters,
  roleKeywords: string[],
  limit: number,
): Promise<PostingCandidate[]> {
  const conds = filterConds(filters);
  const kws = roleKeywords.map((k) => k.trim()).filter(Boolean);
  if (kws.length) {
    const kwConds = kws.map((k) => Prisma.sql`"title" ILIKE ${`%${k}%`}`);
    conds.push(Prisma.sql`(${Prisma.join(kwConds, " OR ")})`);
  }
  const where = Prisma.join(conds, " AND ");
  const rows = await prisma.$queryRaw<PostingCandidate[]>`
    SELECT ${CANDIDATE_COLUMNS}, 0::float8 AS "vectorScore"
    FROM "JobPosting"
    WHERE ${where}
    ORDER BY "postedAt" DESC NULLS LAST, "firstSeenAt" DESC
    LIMIT ${limit}`;
  return rows;
}

/**
 * Retention: soft-expire active postings not re-seen within `retentionDays` (drops
 * them from matching via the postingStatus filter). A later sighting re-activates
 * them in upsertPosting. Returns the number expired.
 */
export async function expireStalePostings(retentionDays: number): Promise<number> {
  if (retentionDays < 0) return 0;
  const n = await prisma.$executeRaw`
    UPDATE "JobPosting"
    SET "postingStatus" = 'expired', "expiresAt" = now()
    WHERE "postingStatus" = 'active'
      AND "lastSeenAt" < now() - ${retentionDays} * interval '1 day'`;
  return n;
}

/**
 * Weekly SAFE purge (spec): HARD-delete postings not re-seen within `retentionDays`
 * AND not referenced by any per-user Job (so Application/JobMatch FKs never break).
 * Keeps recent + user-acted postings → the weekend pool stays warm. Returns count.
 */
export async function purgeStalePostings(retentionDays: number): Promise<number> {
  if (retentionDays < 0) return 0;
  const n = await prisma.$executeRaw`
    DELETE FROM "JobPosting" p
    WHERE p."lastSeenAt" < now() - ${retentionDays} * interval '1 day'
      AND NOT EXISTS (SELECT 1 FROM "Job" j WHERE j."postingId" = p."id")`;
  return n;
}

/**
 * Retention for the durable novelty ledger: drop JobSeen rows not seen within
 * `days`. A job unseen this long that reappears SHOULD re-acquire novelty, so this
 * is the intended semantic, not a leak.
 */
export async function purgeStaleJobSeen(days: number): Promise<number> {
  if (days < 0) return 0;
  return prisma.$executeRaw`DELETE FROM "JobSeen" WHERE "lastSeenAt" < now() - ${days} * interval '1 day'`;
}

/**
 * Retention for the per-user seen ledger: drop only `shown` rows past `days`
 * (keep `applied` rows longer — they back apply-suppression + analytics).
 */
export async function purgeStaleUserJobSeen(days: number): Promise<number> {
  if (days < 0) return 0;
  return prisma.$executeRaw`DELETE FROM "UserJobSeen" WHERE "status" = 'shown' AND "lastShownAt" < now() - ${days} * interval '1 day'`;
}
