import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { applicationRepository } from "../repositories/application-repository.js";
import { applicationUpdateSchema, answerQuestionsSchema, applyFromUrlSchema } from "../../shared/validation.js";
import { aiLimiter } from "../middleware/rate-limit.js";
import { generateApplicationDocuments } from "../services/application/application-generator.js";
import { retryApplication } from "../services/application/retry-service.js";
import { answerQuestions } from "../services/application/qa-generator.js";
import { loadCandidateProfile } from "../services/profile/candidate-profile.js";
import { fillApplication } from "../services/automation/form-filler.js";
import { mapFillCodeToStatus } from "../services/application/status-map.js";
import type { ApplicationPackage } from "../services/application/application-package.js";
import { parseAndCreateApplication, findApplicationByUrl, ensurePackage } from "../services/application/apply-from-url.js";

export const applicationsRouter = Router();

applicationsRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { status, search, limit = "50", offset = "0" } = req.query as Record<string, string>;

  const where: Prisma.ApplicationWhereInput = { userId: req.userId! };
  if (status && status !== "ALL") where.status = status as never;
  if (search) {
    where.OR = [
      { company: { contains: search, mode: "insensitive" } },
      { roleTitle: { contains: search, mode: "insensitive" } },
    ];
  }

  const [applications, total] = await applicationRepository.findManyAndCount(
    where,
    parseInt(limit),
    parseInt(offset),
  );

  // TEMP(model-badge): attach which model produced each app's tailored resume so
  // the Applications UI can show a Claude/local badge. Remove with the UI badge.
  const resumeDocs = await prisma.applicationDocument.findMany({
    where: { applicationId: { in: applications.map((a) => a.id) }, type: "resume" },
    select: { applicationId: true, metadataJson: true },
  });
  const modelByApp = new Map<string, string>();
  for (const d of resumeDocs) {
    const g = (d.metadataJson as { generatedBy?: string } | null)?.generatedBy;
    if (g && !modelByApp.has(d.applicationId)) modelByApp.set(d.applicationId, g);
  }

  // Scrape recency: when the linked job posting was ingested (fallback createdAt),
  // so the candidate sees how fresh each posting is.
  const jobIds = applications.map((a) => a.jobId).filter((id): id is string => Boolean(id));
  const jobs = jobIds.length
    ? await prisma.job.findMany({ where: { id: { in: jobIds } }, select: { id: true, ingestedAt: true, createdAt: true } })
    : [];
  const scrapedByJob = new Map(jobs.map((j) => [j.id, (j.ingestedAt ?? j.createdAt).toISOString()]));

  const enriched = applications.map((a) => ({
    ...a,
    resumeModel: modelByApp.get(a.id) ?? null,
    scrapedAt: a.jobId ? scrapedByJob.get(a.jobId) ?? null : null,
  }));

  res.json({ applications: enriched, total });
}));

// GET /api/applications/documents — every generated document across the user's
// applications (tailored resumes, cover letters, cold emails), newest first, each
// with its application context. Registered BEFORE "/:id" so "documents" is not
// captured as an application id.
applicationsRouter.get("/documents", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const docs = await prisma.applicationDocument.findMany({
    where: {
      application: { userId: req.userId! },
      type: { in: ["resume", "cover_letter", "cold_email"] },
    },
    orderBy: { createdAt: "desc" },
    include: {
      application: {
        select: {
          id: true, company: true, roleTitle: true, status: true, jobUrl: true,
          job: { select: { ingestedAt: true, createdAt: true } },
        },
      },
    },
  });
  res.json({
    documents: docs.map((d) => {
      // Tailored resumes carry downloadable file URLs (PDF + DOCX) in metadata.
      const meta = (d.metadataJson ?? null) as
        | { generatedBy?: string; files?: { pdfUrl?: string; docxUrl?: string } }
        | null;
      const { job, ...appCore } = d.application;
      const scrapedAt = job ? (job.ingestedAt ?? job.createdAt).toISOString() : null;
      return {
        id: d.id,
        type: d.type,
        content: d.content,
        createdAt: d.createdAt,
        pdfUrl: meta?.files?.pdfUrl ?? null,
        docxUrl: meta?.files?.docxUrl ?? d.fileUrl ?? null,
        generatedBy: meta?.generatedBy ?? null,
        application: { ...appCore, scrapedAt },
      };
    }),
  });
}));

// POST /api/applications/from-url — paste-a-link (Part 1.7). Fetch + parse a job
// posting URL, create a Job + Application, and return a preview + detected ATS
// capabilities. Document generation is a SEPARATE confirmed step (the client calls
// POST /:id/generate after the user reviews the preview) so we never spend
// generation AI on a wrong/unsupported link. Declared ABOVE "/:id" so the literal
// "from-url" segment is never captured as an application id.
applicationsRouter.post("/from-url", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = applyFromUrlSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Paste a valid URL");
  const userId = req.userId!;
  const { url } = parsed.data;

  // Prereq: a profile must exist to tailor anything (resume is checked later, at
  // generation time, as a non-blocking warning).
  const profile = await loadCandidateProfile(userId);
  if (!profile) throw badRequest("Complete your profile before applying from a link.");

  const { applicationId, jobData, adapter } = await parseAndCreateApplication(userId, url);
  logger.info({ userId, applicationId, adapter: adapter.id }, "Application created from pasted link");
  res.status(201).json({
    applicationId,
    job: jobData,
    adapter: { id: adapter.id, vendorLabel: adapter.vendorLabel, capabilities: adapter.capabilities, guidance: adapter.guidance ?? null },
  });
}));

// POST /api/applications/resolve-by-url — extension auto-detect (no manual ID).
// Given the URL of the tab the user has open, find the matching application (or
// create one from the URL), ensure an autofill package exists, and return it so
// the extension can fill immediately. Declared ABOVE "/:id" (segment-capture rule).
applicationsRouter.post("/resolve-by-url", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = applyFromUrlSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Provide the page URL");
  const userId = req.userId!;
  const { url } = parsed.data;

  const profile = await loadCandidateProfile(userId);
  if (!profile) throw badRequest("Complete your profile before autofilling.");

  // 1) Reuse an existing application for this URL; 2) otherwise create from the URL.
  let applicationId = await findApplicationByUrl(userId, url);
  let created = false;
  if (!applicationId) {
    const res2 = await parseAndCreateApplication(userId, url);
    applicationId = res2.applicationId;
    created = true;
  }

  // Ensure the autofill package exists (build on the fly if needed — fast, no LLM).
  const pkg = await ensurePackage(applicationId, userId);
  logger.info({ userId, applicationId, created, adapterId: pkg.adapterId }, "Resolved application by URL for extension");
  res.json({ applicationId, created, package: pkg });
}));

// GET /api/applications/:id — full detail incl generated documents + answers.
applicationsRouter.get("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const application = await prisma.application.findFirst({
    where: { id, userId: req.userId! },
    include: {
      documents: { orderBy: { createdAt: "desc" } },
      answers: { orderBy: { createdAt: "asc" } },
      events: { orderBy: { createdAt: "desc" }, take: 20 },
      job: true,
    },
  });
  if (!application) throw notFound("Application not found");

  const pkgDoc = application.documents.find((d) => d.type === "application_package");
  let applicationPackage: ApplicationPackage | null = null;
  if (pkgDoc?.content) {
    try {
      applicationPackage = JSON.parse(pkgDoc.content) as ApplicationPackage;
    } catch {
      applicationPackage = null;
    }
  }

  res.json({
    application: {
      ...application,
      documents: application.documents.map((d) => ({
        id: d.id, type: d.type, fileUrl: d.fileUrl, content: d.content,
        metadata: d.metadataJson, createdAt: d.createdAt,
      })),
      applicationPackage,
    },
  });
}));

// POST /api/applications/:id/generate — (re)generate all AI documents for an
// application: tailored resume, cover letter, cold email, autofill package.
applicationsRouter.post("/:id/generate", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await applicationRepository.findOwned(id, req.userId!);
  if (!app) throw notFound("Application not found");

  const result = await generateApplicationDocuments(id);
  logger.info({ applicationId: id, status: result.status }, "Documents generated via API");
  res.json(result);
}));

// POST /api/applications/:id/retry — re-run document generation for an
// application that failed, bounded by the per-app attempt cap.
applicationsRouter.post("/:id/retry", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await applicationRepository.findOwned(id, req.userId!);
  if (!app) throw notFound("Application not found");

  const result = await retryApplication(id);
  if (!result.retried && result.reason.includes("not retryable")) throw badRequest(result.reason);
  res.json(result);
}));

// POST /api/applications/:id/answers — generate/answer application questions.
// Body: { questions: string[] }. Persists results to ApplicationAnswer.
applicationsRouter.post("/:id/answers", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await prisma.application.findFirst({ where: { id, userId: req.userId! }, include: { job: true } });
  if (!app) throw notFound("Application not found");

  const parsed = answerQuestionsSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Provide a non-empty 'questions' array (max 50)");
  const questions = parsed.data.questions;

  const profile = await loadCandidateProfile(req.userId!);
  if (!profile) throw notFound("User profile not found");

  const answered = await answerQuestions(questions, profile, {
    jobTitle: app.roleTitle,
    company: app.company,
    jobDescription: app.job?.descriptionClean ?? app.job?.description ?? null,
    userId: req.userId!,
    runId: app.runId,
    applicationId: id,
  });

  // Persist (replace prior answers for these questions).
  const saved = [];
  for (const { question, result } of answered) {
    const row = await prisma.applicationAnswer.create({
      data: {
        applicationId: id,
        question,
        answer: result.answer ?? "",
        isSensitive: result.isSensitive,
        approved: result.needsUserAction ? null : true,
      },
    });
    saved.push({ id: row.id, question, ...result });
  }
  res.json({ answers: saved });
}));

// POST /api/applications/:id/approve — user approves a NEEDS_APPROVAL application.
applicationsRouter.post("/:id/approve", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await applicationRepository.findOwned(id, req.userId!);
  if (!app) throw notFound("Application not found");
  const updated = await applicationRepository.update(id, { status: "APPROVED" as never });
  await prisma.applicationEvent.create({ data: { applicationId: id, type: "approved", description: "User approved" } });
  res.json({ application: updated });
}));

// POST /api/applications/:id/decline — user declines an application.
applicationsRouter.post("/:id/decline", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await applicationRepository.findOwned(id, req.userId!);
  if (!app) throw notFound("Application not found");
  const updated = await applicationRepository.update(id, { status: "DECLINED" as never });
  await prisma.applicationEvent.create({ data: { applicationId: id, type: "declined", description: "User declined" } });
  res.json({ application: updated });
}));

// POST /api/applications/:id/mark-applied — the user completed the application
// themselves in their own browser (the assisted / manual handoff for blocked,
// unsupported, or assist-required forms). Records it as APPLIED.
applicationsRouter.post("/:id/mark-applied", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await prisma.application.findFirst({ where: { id, userId: req.userId! }, select: { id: true } });
  if (!app) throw notFound("Application not found");
  const updated = await prisma.application.update({
    where: { id },
    data: { status: "APPLIED" as never, appliedAt: new Date() },
  });
  await prisma.applicationEvent.create({
    data: { applicationId: id, type: "submitted_manually", description: "User marked as submitted (manual/assisted handoff)" },
  });
  res.json({ application: updated });
}));

// POST /api/applications/:id/submit — drive the browser to fill (and, only if
// AUTO_SUBMIT is enabled, submit) the application form using the prepared package.
// Safety: blockers (CAPTCHA/login/OTP) and unsupported ATS surface as
// ASSISTED_REQUIRED/NEEDS_APPROVAL rather than being bypassed.
applicationsRouter.post("/:id/submit", requireAuth, aiLimiter, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await prisma.application.findFirst({
    where: { id, userId: req.userId! },
    include: { documents: true, job: true },
  });
  if (!app) throw notFound("Application not found");

  const pkgDoc = app.documents.find((d) => d.type === "application_package");
  if (!pkgDoc?.content) throw badRequest("No application package — generate documents first");
  const pkg = JSON.parse(pkgDoc.content) as ApplicationPackage;

  // Consent gate: automation that fills/submits forms on the user's behalf
  // requires explicit data-processing consent (captured at onboarding / profile).
  const consentProfile = await prisma.userProfile.findUnique({
    where: { userId: req.userId! },
    select: { consentToDataProcessing: true },
  });
  if (!consentProfile?.consentToDataProcessing) {
    throw badRequest(
      "Automation consent required. Enable 'consent to data processing' in your profile's Application Details before submitting.",
    );
  }

  const profile = await loadCandidateProfile(req.userId!);
  if (!profile) throw notFound("User profile not found");

  const result = await fillApplication({
    pkg,
    profile,
    ctx: {
      jobTitle: app.roleTitle,
      company: app.company,
      jobDescription: app.job?.descriptionClean ?? app.job?.description ?? null,
      userId: req.userId!,
      runId: app.runId,
      applicationId: id,
    },
  });

  // Map the automation outcome onto the application lifecycle (deterministic).
  const nextStatus = mapFillCodeToStatus(result.code);
  await prisma.application.update({
    where: { id },
    data: {
      status: nextStatus as never,
      ...(nextStatus === "APPLIED" ? { appliedAt: new Date() } : {}),
      ...(nextStatus === "FAILED_TECHNICAL" ? { failureReason: result.reason } : {}),
    },
  });
  await prisma.applicationEvent.create({
    data: {
      applicationId: id,
      type: nextStatus === "APPLIED" ? "submitted" : "submit_attempted",
      description: result.reason,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: { code: result.code, blocker: result.blocker ?? null, filledFields: result.filledFields } as any,
    },
  });
  res.json({ result, status: nextStatus });
}));

applicationsRouter.patch("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = applicationUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid update data");

  const id = req.params["id"] as string;
  const app = await applicationRepository.findOwned(id, req.userId!);
  if (!app) throw notFound("Application not found");

  const updated = await applicationRepository.update(id, {
    ...(parsed.data.status ? { status: parsed.data.status as never } : {}),
    ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {}),
    ...(parsed.data.followUpDate !== undefined ? { followUpDate: parsed.data.followUpDate ? new Date(parsed.data.followUpDate) : null } : {}),
    ...(parsed.data.hiringManagerEmail !== undefined ? { hiringManagerEmail: parsed.data.hiringManagerEmail } : {}),
  });
  res.json({ application: updated });
}));

applicationsRouter.delete("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await applicationRepository.findOwned(id, req.userId!);
  if (!app) throw notFound("Application not found");

  await applicationRepository.update(id, { status: "ARCHIVED" as never });
  res.json({ message: "Archived" });
}));
