import { prisma } from "../lib/db.js";
import type { Prisma } from "@prisma/client";

// Data access for the Job + JobMatch aggregates.
export const jobRepository = {
  createJob: (data: Prisma.JobUncheckedCreateInput) => prisma.job.create({ data }),

  createMatch: (data: Prisma.JobMatchUncheckedCreateInput) => prisma.jobMatch.create({ data }),

  /**
   * Scored matches for a user, newest/highest first, with the joined job.
   * Excludes jobs the user has already APPLIED to — those have "moved" to Applied,
   * so they should no longer surface in Jobs Found. (Pipeline-prepared apps that
   * were never user-confirmed stay, so the user can still choose to apply.)
   */
  findMatches: (userId: string, decision?: string) =>
    prisma.jobMatch.findMany({
      where: {
        userId,
        ...(decision ? { decision } : {}),
        job: { applications: { none: { userId, status: "APPLIED" } } },
      },
      include: { job: true },
      orderBy: { score: "desc" },
    }),

  /** Ingested T2 job candidates for a user (ingestion output). */
  findCandidates: (
    userId: string,
    filters: { runId?: string; remoteType?: string; seniority?: string; freshnessHours?: number; sortBy?: "recent" },
  ) => {
    // Freshness: posted OR first ingested within the window (fresh to us OR
    // genuinely recently posted) — mirrors the global pool's freshness semantics.
    const since =
      filters.freshnessHours && filters.freshnessHours > 0
        ? new Date(Date.now() - filters.freshnessHours * 3600_000)
        : null;
    return prisma.job.findMany({
      where: {
        userId,
        ...(filters.runId ? { runId: filters.runId } : {}),
        ...(filters.remoteType ? { remoteType: filters.remoteType } : {}),
        ...(filters.seniority ? { seniority: filters.seniority } : {}),
        ...(since ? { OR: [{ postedAt: { gt: since } }, { ingestedAt: { gt: since } }] } : {}),
      },
      // sortBy=recent surfaces newest postings first (time-of-release emphasis);
      // default keeps the prior ingestion-order behavior.
      orderBy:
        filters.sortBy === "recent"
          ? [{ postedAt: { sort: "desc", nulls: "last" } }, { ingestedAt: "desc" }]
          : { ingestedAt: "desc" },
      take: 200,
    });
  },

  findMatchWithJob: (jobId: string, userId: string) =>
    prisma.jobMatch.findFirst({ where: { jobId, userId }, include: { job: true } }),

  findMatch: (jobId: string, userId: string) =>
    prisma.jobMatch.findFirst({ where: { jobId, userId } }),

  updateMatch: (id: string, data: Prisma.JobMatchUpdateInput) =>
    prisma.jobMatch.update({ where: { id }, data }),

  deleteMatch: (id: string) => prisma.jobMatch.delete({ where: { id } }),

  countMatchesForJob: (jobId: string) => prisma.jobMatch.count({ where: { jobId } }),

  deleteJob: (id: string) => prisma.job.delete({ where: { id } }),
};
