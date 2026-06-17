// Application pipeline worker — the end-to-end async run after ingestion.
//
// This is the TypeScript analog of Job_applying_agent's PreparationRunner.run_scan:
// for each discovered job it scores the match, and for shortlisted jobs it creates
// an Application and generates its documents (tailored resume, cover letter, cold
// email, autofill package). It NEVER submits — it prepares applications to the
// point a user can approve/submit, mirroring the "prepare, user submits" model.
//
// Run status flow: ...COMPLETED(ingestion) -> SCORING -> GENERATING_DOCUMENTS ->
// WAITING_FOR_APPROVAL | COMPLETED.
import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { runIngestion } from "../services/ingestion/ingestion-orchestrator.js";
import { scoreJobMatch } from "../services/matching/match-scorer.js";
import { buildProfileSnapshot } from "../services/matching/profile-snapshot.js";
import { selectTopMatches, type ScoredJob } from "../services/matching/select-matches.js";
import type { ParsedJob } from "../services/job-discovery/job-parser.js";
import { generateApplicationDocuments } from "../services/application/application-generator.js";
import { remainingApplications, getPlanLimits } from "../services/billing/usage-limits.js";
import { notifyRunCompleted } from "../services/notifications/email-service.js";

const WORKER_NAME = "application-pipeline-worker";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toParsedJob(job: any): ParsedJob {
  return {
    title: job.title,
    company: job.company,
    location: job.location ?? null,
    isRemote: job.isRemote ?? false,
    salaryMin: job.salaryMin ?? null,
    salaryMax: job.salaryMax ?? null,
    salaryCurrency: job.salaryCurrency ?? null,
    description: job.descriptionClean ?? job.description ?? "",
    requirements: (job.requirementsJson as string[]) ?? [],
    skills: (job.skillsJson as string[]) ?? [],
    experienceMin: job.experienceMin ?? null,
    experienceMax: job.experienceMax ?? null,
    atsPlatform: job.atsPlatform ?? null,
    workAuthorization: job.workAuthorization ?? null,
    jobUrl: job.jobUrl ?? null,
  };
}

/**
 * Score the run's discovered jobs and generate applications for shortlisted ones.
 * Assumes ingestion has already populated Job rows for the run. Updates run
 * metrics and status; never throws (records failure on the run).
 */
export async function runApplicationPipeline(runId: string): Promise<void> {
  const run = await prisma.applicationRun.findUnique({ where: { id: runId } });
  if (!run) {
    logger.error({ runId }, "Application pipeline: run not found");
    return;
  }
  const userId = run.userId;

  try {
    const snapshot = await buildProfileSnapshot(userId);
    const prefs = await prisma.userPreference.findUnique({ where: { userId } });
    const planLimits = await getPlanLimits(userId);
    // Daily cap comes from the active plan tier (30/50/75/day); the user may set a
    // LOWER personal cap, but never exceed the plan. Monthly allowance is the hard
    // ceiling on top of that.
    const planDailyCap = Math.max(1, planLimits.applicationsPerDay);
    const userDailyCap = prefs?.applicationsPerDay ?? planDailyCap;
    const dailyCap = Math.max(1, Math.min(planDailyCap, userDailyCap));
    const monthlyRemaining = await remainingApplications(userId);
    const cap = Math.max(0, Math.min(dailyCap, monthlyRemaining));
    if (monthlyRemaining <= 0) {
      logger.info(
        { userId, plan: planLimits.planName, limit: planLimits.applicationsPerMonth },
        "Monthly application limit reached — no new applications will be generated this run",
      );
    }
    const primaryResume = await prisma.resume.findFirst({
      where: { userId },
      orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
    });

    const jobs = await prisma.job.findMany({ where: { runId, userId }, orderBy: { ingestedAt: "desc" } });

    await prisma.applicationRun.update({ where: { id: runId }, data: { status: "SCORING" } });

    // Jobs the user has ALREADY applied to (any run) — never re-surface them.
    const appliedRows = await prisma.application.findMany({
      where: { userId, jobId: { not: null } },
      select: { jobId: true },
    });
    const alreadyApplied = new Set(appliedRows.map((r) => r.jobId).filter((v): v is string => Boolean(v)));

    // Score EVERY discovered job, then globally rank — so the shortlist is the
    // BEST `cap` matches, not the first `cap` over threshold in discovery order.
    const scored: ScoredJob[] = [];
    for (const job of jobs) {
      const result = await scoreJobMatch(toParsedJob(job), snapshot);
      await prisma.jobMatch.upsert({
        where: { jobId_userId: { jobId: job.id, userId } },
        create: {
          jobId: job.id, userId, score: result.score, decision: result.decision,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reasonsJson: result.reasons as any, risksJson: result.risks as any,
        },
        update: {
          score: result.score, decision: result.decision,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          reasonsJson: result.reasons as any, risksJson: result.risks as any,
        },
      });
      scored.push({
        jobId: job.id, score: result.score, decision: result.decision,
        company: job.company, title: job.title,
        jobUrl: job.applyUrl ?? job.jobUrl ?? null, atsPlatform: job.atsPlatform ?? null,
      });
    }

    // Diversity: don't let one employer dominate the day's shortlist. At most
    // ~1/3 of the cap (min 2) from a single company, then fill by next-best score.
    const maxPerCompany = Math.max(2, Math.ceil(cap / 3));
    const shortlist = selectTopMatches(scored, cap, { alreadyAppliedJobIds: alreadyApplied, maxPerCompany });
    const shortlisted = shortlist.length;

    await prisma.applicationRun.update({
      where: { id: runId },
      data: { status: "GENERATING_DOCUMENTS", jobsShortlisted: shortlisted, applicationsTotal: shortlist.length },
    });

    let done = 0;
    let needsApproval = 0;
    for (const item of shortlist) {
      // Skip if an application for this job already exists in the run.
      const existing = await prisma.application.findFirst({ where: { userId, jobId: item.jobId, runId } });
      if (existing) continue;

      const application = await prisma.application.create({
        data: {
          userId, runId, jobId: item.jobId,
          resumeId: primaryResume?.id ?? null,
          company: item.company, roleTitle: item.title,
          jobUrl: item.jobUrl, atsPlatform: item.atsPlatform,
          matchScore: item.score, status: "SHORTLISTED",
        },
      });
      try {
        const gen = await generateApplicationDocuments(application.id);
        done++;
        if (gen.status === "NEEDS_APPROVAL") needsApproval++;
      } catch (err) {
        logger.warn({ runId, applicationId: application.id, err: String(err) }, "document generation failed");
        await prisma.application.update({
          where: { id: application.id },
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          data: { status: "FAILED" as any, failureReason: String(err) },
        });
      }
    }

    await prisma.applicationRun.update({
      where: { id: runId },
      data: {
        status: needsApproval > 0 ? "WAITING_FOR_APPROVAL" : "COMPLETED",
        applicationsDone: done,
        completedAt: new Date(),
      },
    });
    logger.info({ runId, userId, shortlisted, applications: done, needsApproval }, "Application pipeline completed");
    // Notify the user their run finished (fire-and-forget; never blocks the run).
    void notifyRunCompleted(userId, { applications: done, needsApproval });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ runId, userId, err: msg }, "Application pipeline failed");
    await prisma.applicationRun
      .update({ where: { id: runId }, data: { status: "FAILED", errorMessage: msg, completedAt: new Date() } })
      .catch(() => {});
  }
}

/** Full run: discover jobs (ingestion) then score + generate applications. */
export async function runFullPipeline(runId: string): Promise<void> {
  await runIngestion(runId);
  const run = await prisma.applicationRun.findUnique({ where: { id: runId } });
  // Only proceed to generation if ingestion completed (not FAILED/CANCELLED).
  if (run?.status === "COMPLETED") {
    await runApplicationPipeline(runId);
  }
}

/** Fire-and-forget trigger for the full pipeline. */
export function triggerFullPipeline(runId: string): void {
  void runFullPipeline(runId).catch((err) => {
    logger.error({ runId, err: String(err), worker: WORKER_NAME }, "Unhandled pipeline error");
  });
}
