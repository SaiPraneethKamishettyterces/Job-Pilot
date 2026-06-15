import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { jobRepository } from "../repositories/job-repository.js";
import { getProfile, getPreferences } from "../services/profile/profile-service.js";
import { parseJobDescription, fetchUrlText } from "../services/job-discovery/job-parser.js";
import { scoreJobMatch, type ProfileSnapshot } from "../services/matching/match-scorer.js";
import { addJobSchema } from "../../shared/validation.js";

export const jobsRouter = Router();

async function getProfileSnapshot(userId: string): Promise<ProfileSnapshot> {
  const [profile, prefs] = await Promise.all([getProfile(userId), getPreferences(userId)]);
  return {
    skills: (profile?.skillsJson as string[] | undefined) ?? [],
    yearsExperience: profile?.yearsExperience ?? null,
    summary: profile?.summary ?? null,
    workAuthorization: profile?.workAuthorization ?? null,
    targetRoles: (prefs?.targetRolesJson as string[] | undefined) ?? [],
    blockedCompanies: (prefs?.blockedCompaniesJson as string[] | undefined) ?? [],
    remotePreference: prefs?.remotePreference ?? "any",
    minSalary: prefs?.minSalary ?? null,
    matchThreshold: prefs?.matchThreshold ?? 70,
  };
}

// POST /api/jobs — parse JD from URL or text, score, save
jobsRouter.post("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
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
  const profile = await getProfileSnapshot(userId);
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
  const { runId, remoteType, seniority } = req.query;
  const jobs = await jobRepository.findCandidates(req.userId!, {
    runId: runId ? String(runId) : undefined,
    remoteType: remoteType ? String(remoteType) : undefined,
    seniority: seniority ? String(seniority) : undefined,
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
jobsRouter.post("/:id/rescore", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const jobId = req.params["id"] as string;

  const match = await jobRepository.findMatchWithJob(jobId, userId);
  if (!match) throw notFound("Job not found");

  const profile = await getProfileSnapshot(userId);
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
