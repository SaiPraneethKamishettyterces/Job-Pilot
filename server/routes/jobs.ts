import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { jobRepository } from "../repositories/job-repository.js";
import { prisma } from "../lib/db.js";
import { parseJobDescription, fetchUrlText } from "../services/job-discovery/job-parser.js";
import { scoreJobMatch } from "../services/matching/match-scorer.js";
import { buildProfileSnapshot } from "../services/matching/profile-snapshot.js";
import { addJobSchema } from "../../shared/validation.js";
import { aiLimiter } from "../middleware/rate-limit.js";

export const jobsRouter = Router();

// Human "posted X ago" label for the freshness/time-of-release emphasis (Part 1.7).
function postedAgo(d: Date | null): string | null {
  if (!d) return null;
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months < 12 ? `${months}mo ago` : `${Math.floor(months / 12)}y ago`;
}

// POST /api/jobs — parse JD from URL or text, score, save
jobsRouter.post("/", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = addJobSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");

  const userId = req.userId!;
  const { jobUrl, rawText } = parsed.data;

  // 1. Get JD text
  let jdText = rawText ?? "";
  if (jobUrl && !rawText) jdText = await fetchUrlText(jobUrl);

  // 2. Parse with Claude
  const jobData = await parseJobDescription(jdText, jobUrl);

  // 3. Persist job
  const job = await jobRepository.createJob({
    jobUrl: jobData.jobUrl,
    title: jobData.title,
    company: jobData.company,
    location: jobData.location,
    isRemote: jobData.isRemote,
    salaryMin: jobData.salaryMin,
    salaryMax: jobData.salaryMax,
    salaryCurrency: jobData.salaryCurrency,
    description: jobData.description,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    requirementsJson: jobData.requirements as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    skillsJson: jobData.skills as any,
    experienceMin: jobData.experienceMin,
    experienceMax: jobData.experienceMax,
    atsPlatform: jobData.atsPlatform,
    workAuthorization: jobData.workAuthorization,
  });

  // 4. Score match
  const profile = await buildProfileSnapshot(userId);
  const matchResult = await scoreJobMatch(jobData, profile);

  // 5. Persist match
  const match = await jobRepository.createMatch({
    jobId: job.id,
    userId,
    score: matchResult.score,
    decision: matchResult.decision,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reasonsJson: matchResult.reasons as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    risksJson: matchResult.risks as any,
  });

  logger.info({ userId, jobId: job.id, score: matchResult.score }, "Job added and scored");
  res.status(201).json({
    job: { ...job, skills: job.skillsJson, requirements: job.requirementsJson },
    match: { ...match, reasons: matchResult.reasons, risks: matchResult.risks },
  });
}));

// GET /api/jobs — list all jobs with match scores for current user
jobsRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { decision } = req.query;
  const matches = await jobRepository.findMatches(
    req.userId!,
    decision ? String(decision) : undefined,
  );

  const items = matches.map((m) => ({
    matchId: m.id,
    score: m.score,
    decision: m.decision,
    reasons: (m.reasonsJson as string[]) ?? [],
    risks: (m.risksJson as string[]) ?? [],
    matchedAt: m.createdAt,
    job: {
      id: m.job.id,
      title: m.job.title,
      company: m.job.company,
      location: m.job.location,
      isRemote: m.job.isRemote,
      salaryMin: m.job.salaryMin,
      salaryMax: m.job.salaryMax,
      salaryCurrency: m.job.salaryCurrency,
      atsPlatform: m.job.atsPlatform,
      jobUrl: m.job.jobUrl,
      skills: (m.job.skillsJson as string[]) ?? [],
      requirements: (m.job.requirementsJson as string[]) ?? [],
      experienceMin: m.job.experienceMin,
      experienceMax: m.job.experienceMax,
      postedAt: m.job.postedAt,
    },
  }));

  res.json({ jobs: items, total: items.length });
}));

// GET /api/jobs/candidates — list ingested T2 job_candidates for the current user
jobsRouter.get("/candidates", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { runId, remoteType, seniority, sortBy, freshnessHours } = req.query;
  const fh = freshnessHours ? Number(freshnessHours) : undefined;
  const jobs = await jobRepository.findCandidates(req.userId!, {
    runId: runId ? String(runId) : undefined,
    remoteType: remoteType ? String(remoteType) : undefined,
    seniority: seniority ? String(seniority) : undefined,
    freshnessHours: fh && Number.isFinite(fh) && fh > 0 ? fh : undefined,
    sortBy: sortBy === "recent" ? "recent" : undefined,
  });

  const items = jobs.map((j) => ({
    id: j.id,
    runId: j.runId,
    source: j.sourceName,
    atsPlatform: j.atsPlatform,
    title: j.title,
    company: j.company,
    department: j.department,
    location: j.location,
    remoteType: j.remoteType,
    employmentType: j.employmentType,
    seniority: j.seniority,
    salaryMin: j.salaryMin,
    salaryMax: j.salaryMax,
    salaryCurrency: j.salaryCurrency,
    salaryPeriod: j.salaryPeriod,
    visaSponsored: j.visaSponsored,
    skills: (j.skillsJson as string[]) ?? [],
    tools: (j.toolsJson as string[]) ?? [],
    jobUrl: j.jobUrl,
    applyUrl: j.applyUrl,
    postedAt: j.postedAt?.toISOString() ?? null,
    postedAgoLabel: postedAgo(j.postedAt ?? j.ingestedAt),
    ingestedAt: j.ingestedAt?.toISOString() ?? null,
  }));

  res.json({ jobs: items, total: items.length });
}));

// GET /api/jobs/:id — single job with match
jobsRouter.get("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const jobId = req.params["id"] as string;
  const match = await jobRepository.findMatchWithJob(jobId, req.userId!);
  if (!match) throw notFound("Job not found");

  res.json({
    matchId: match.id,
    score: match.score,
    decision: match.decision,
    reasons: (match.reasonsJson as string[]) ?? [],
    risks: (match.risksJson as string[]) ?? [],
    job: {
      ...match.job,
      skills: (match.job.skillsJson as string[]) ?? [],
      requirements: (match.job.requirementsJson as string[]) ?? [],
    },
  });
}));

// POST /api/jobs/:id/rescore — re-run match scoring for a job
jobsRouter.post("/:id/rescore", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const jobId = req.params["id"] as string;

  const match = await jobRepository.findMatchWithJob(jobId, userId);
  if (!match) throw notFound("Job not found");

  const profile = await buildProfileSnapshot(userId);
  const jobData = {
    title: match.job.title,
    company: match.job.company,
    location: match.job.location ?? null,
    isRemote: match.job.isRemote ?? false,
    salaryMin: match.job.salaryMin ?? null,
    salaryMax: match.job.salaryMax ?? null,
    salaryCurrency: match.job.salaryCurrency ?? null,
    description: match.job.description ?? "",
    requirements: (match.job.requirementsJson as string[]) ?? [],
    skills: (match.job.skillsJson as string[]) ?? [],
    experienceMin: match.job.experienceMin ?? null,
    experienceMax: match.job.experienceMax ?? null,
    atsPlatform: match.job.atsPlatform ?? null,
    workAuthorization: match.job.workAuthorization ?? null,
    jobUrl: match.job.jobUrl ?? null,
  };

  const result = await scoreJobMatch(jobData, profile);
  const updated = await jobRepository.updateMatch(match.id, {
    score: result.score,
    decision: result.decision,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    reasonsJson: result.reasons as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    risksJson: result.risks as any,
  });

  res.json({
    score: updated.score,
    decision: updated.decision,
    reasons: result.reasons,
    risks: result.risks,
  });
}));

// GET /api/jobs/:id/application — read-only: the user's existing application for this
// job + its generated docs (so the apply flow can REUSE already-generated documents
// instead of re-generating). Does NOT create anything.
jobsRouter.get("/:id/application", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const jobId = req.params["id"] as string;
  const app = await prisma.application.findFirst({
    where: { userId: req.userId!, jobId },
    orderBy: { createdAt: "desc" },
    include: {
      documents: {
        where: { type: { in: ["resume", "cover_letter", "cold_email"] } },
        select: { id: true, type: true, fileUrl: true, content: true, createdAt: true },
      },
    },
  });
  if (!app) { res.json({ applicationId: null, status: null, documents: [] }); return; }
  res.json({ applicationId: app.id, status: app.status, documents: app.documents });
}));

// POST /api/jobs/:id/apply — start a manual application for an EXISTING matched job.
// Finds-or-creates ONE Application linked to that exact job (so it dedups and so the
// job correctly "moves" out of Jobs Found once marked APPLIED). Does NOT mark applied
// — that happens after the user confirms via /applications/:id/mark-applied.
jobsRouter.post("/:id/apply", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const jobId = req.params["id"] as string;
  const userId = req.userId!;
  const match = await jobRepository.findMatchWithJob(jobId, userId);
  if (!match) throw notFound("Job not found");
  const job = match.job;

  let application = await prisma.application.findFirst({ where: { userId, jobId } });
  if (!application) {
    application = await prisma.application.create({
      data: {
        userId, jobId,
        company: job.company, roleTitle: job.title,
        jobUrl: job.jobUrl, atsPlatform: job.atsPlatform,
        matchScore: match.score, status: "GENERATED",
      },
    });
    await prisma.applicationEvent.create({
      data: { applicationId: application.id, type: "created_from_jobs", description: "Started from Jobs Found" },
    });
    logger.info({ userId, jobId, applicationId: application.id }, "Application created from Jobs Found apply");
  }
  res.json({ applicationId: application.id, status: application.status });
}));

// DELETE /api/jobs/:id — remove job match (and job if no other matches)
jobsRouter.delete("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const jobId = req.params["id"] as string;
  const match = await jobRepository.findMatch(jobId, req.userId!);
  if (!match) throw notFound("Job not found");

  await jobRepository.deleteMatch(match.id);

  // Clean up orphaned job records
  const otherMatches = await jobRepository.countMatchesForJob(jobId);
  if (otherMatches === 0) {
    await jobRepository.deleteJob(jobId).catch(() => {});
  }

  res.json({ message: "Job removed" });
}));
