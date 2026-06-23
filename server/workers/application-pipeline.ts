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
import { buildProfileSnapshot } from "../services/matching/profile-snapshot.js";
import { generateCandidates } from "../services/matching/candidate-generator.js";
import { rerankCandidates } from "../services/matching/rerank.js";
import { selectTopMatches } from "../services/matching/select-matches.js";
import { generateApplicationDocuments } from "../services/application/application-generator.js";
import { remainingApplications, getPlanLimits } from "../services/billing/usage-limits.js";
import { notifyRunCompleted } from "../services/notifications/email-service.js";

const WORKER_NAME = "application-pipeline-worker";

/**
 * Two-stage match for a run: retrieve candidates from the global pool (stage A),
 * rerank + materialize per-user Jobs/Matches (stage B), then generate applications
 * for the best shortlist. Updates run metrics and status; never throws.
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

    await prisma.applicationRun.update({ where: { id: runId }, data: { status: "SCORING" } });

    // Jobs the user has ALREADY applied to (any run) — never re-surface them.
    const appliedRows = await prisma.application.findMany({
      where: { userId, jobId: { not: null } },
      select: { jobId: true },
    });
    const alreadyApplied = new Set(appliedRows.map((r) => r.jobId).filter((v): v is string => Boolean(v)));

    // Stage A: cheap vector + filter retrieval from the global pool (~200 candidates).
    // Stage B: LLM-rerank only the top slice and materialize per-user Job/JobMatch.
    // The result is the BEST matches, scored — not "first cap in discovery order".
    const candidates = await generateCandidates(userId, snapshot);
    await prisma.applicationRun.update({
      where: { id: runId },
      data: { jobsDiscovered: candidates.length },
    });
    const scored = await rerankCandidates(candidates, snapshot, userId, runId);

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

/**
 * Full per-user run: two-stage match against the shared global pool, then generate
 * applications. Job discovery is NO LONGER per-run — the pool is kept fresh by the
 * scheduled global ingestor (runGlobalIngestion), so this reads from it directly.
 */
export async function runFullPipeline(runId: string): Promise<void> {
  await runApplicationPipeline(runId);
}

/** Fire-and-forget trigger for the full pipeline. */
export function triggerFullPipeline(runId: string): void {
  void runFullPipeline(runId).catch((err) => {
    logger.error({ runId, err: String(err), worker: WORKER_NAME }, "Unhandled pipeline error");
  });
}
