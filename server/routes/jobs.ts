import { Router } from "express";
import { z } from "zod";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";
import { parseJobDescription, fetchUrlText } from "../services/job-discovery/job-parser.js";
import { scoreJobMatch, type ProfileSnapshot } from "../services/matching/match-scorer.js";

export const jobsRouter = Router();

const addJobSchema = z
  .object({
    jobUrl: z.string().url().optional(),
    rawText: z.string().min(50).optional(),
  })
  .refine((d) => d.jobUrl || d.rawText, {
    message: "Provide either jobUrl or rawText",
  });

async function getProfileSnapshot(userId: string): Promise<ProfileSnapshot> {
  const [profile, prefs] = await Promise.all([
    prisma.userProfile.findUnique({ where: { userId } }),
    prisma.userPreference.findUnique({ where: { userId } }),
  ]);
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
jobsRouter.post("/", requireAuth, async (req: AuthRequest, res) => {
  const parsed = addJobSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }

  const userId = req.userId!;
  const { jobUrl, rawText } = parsed.data;

  try {
    // 1. Get JD text
    let jdText = rawText ?? "";
    if (jobUrl && !rawText) {
      jdText = await fetchUrlText(jobUrl);
    }

    // 2. Parse with Claude
    const jobData = await parseJobDescription(jdText, jobUrl);

    // 3. Persist job
    const job = await prisma.job.create({
      data: {
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
      },
    });

    // 4. Score match
    const profile = await getProfileSnapshot(userId);
    const matchResult = await scoreJobMatch(jobData, profile);

    // 5. Persist match
    const match = await prisma.jobMatch.create({
      data: {
        jobId: job.id,
        userId,
        score: matchResult.score,
        decision: matchResult.decision,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reasonsJson: matchResult.reasons as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        risksJson: matchResult.risks as any,
      },
    });

    logger.info({ userId, jobId: job.id, score: matchResult.score }, "Job added and scored");
    res.status(201).json({
      job: {
        ...job,
        skills: job.skillsJson,
        requirements: job.requirementsJson,
      },
      match: {
        ...match,
        reasons: matchResult.reasons,
        risks: matchResult.risks,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err, userId }, "Failed to add job");
    res.status(500).json({ message: msg });
  }
});

// GET /api/jobs — list all jobs with match scores for current user
jobsRouter.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const { decision } = req.query;

  try {
    const matches = await prisma.jobMatch.findMany({
      where: {
        userId,
        ...(decision ? { decision: String(decision) } : {}),
      },
      include: { job: true },
      orderBy: { score: "desc" },
    });

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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({ message: "Database unavailable", detail: msg });
  }
});

// GET /api/jobs/:id — single job with match
jobsRouter.get("/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const jobId = req.params["id"] as string;

  try {
    const match = await prisma.jobMatch.findFirst({
      where: { jobId, userId },
      include: { job: true },
    });
    if (!match) { res.status(404).json({ message: "Job not found" }); return; }

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
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({ message: "Database unavailable", detail: msg });
  }
});

// POST /api/jobs/:id/rescore — re-run match scoring for a job
jobsRouter.post("/:id/rescore", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const jobId = req.params["id"] as string;

  try {
    const match = await prisma.jobMatch.findFirst({
      where: { jobId, userId },
      include: { job: true },
    });
    if (!match) { res.status(404).json({ message: "Job not found" }); return; }

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
    const updated = await prisma.jobMatch.update({
      where: { id: match.id },
      data: {
        score: result.score,
        decision: result.decision,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        reasonsJson: result.reasons as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        risksJson: result.risks as any,
      },
    });

    res.json({
      score: updated.score,
      decision: updated.decision,
      reasons: result.reasons,
      risks: result.risks,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(500).json({ message: msg });
  }
});

// DELETE /api/jobs/:id — remove job match (and job if no other matches)
jobsRouter.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const jobId = req.params["id"] as string;

  try {
    const match = await prisma.jobMatch.findFirst({ where: { jobId, userId } });
    if (!match) { res.status(404).json({ message: "Job not found" }); return; }

    await prisma.jobMatch.delete({ where: { id: match.id } });

    // Clean up orphaned job records
    const otherMatches = await prisma.jobMatch.count({ where: { jobId } });
    if (otherMatches === 0) {
      await prisma.job.delete({ where: { id: jobId } }).catch(() => {});
    }

    res.json({ message: "Job removed" });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    res.status(503).json({ message: "Database unavailable", detail: msg });
  }
});
