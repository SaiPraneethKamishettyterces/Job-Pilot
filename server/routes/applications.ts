import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { prisma } from "../lib/db.js";
import { logger } from "../lib/logger.js";
import { applicationRepository } from "../repositories/application-repository.js";
import { applicationUpdateSchema } from "../../shared/validation.js";
import { generateApplicationDocuments } from "../services/application/application-generator.js";
import { answerQuestions } from "../services/application/qa-generator.js";
import { loadCandidateProfile } from "../services/profile/candidate-profile.js";
import { fillApplication } from "../services/automation/form-filler.js";
import type { ApplicationPackage } from "../services/application/application-package.js";

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

  res.json({ applications, total });
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
applicationsRouter.post("/:id/generate", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await applicationRepository.findOwned(id, req.userId!);
  if (!app) throw notFound("Application not found");

  const result = await generateApplicationDocuments(id);
  logger.info({ applicationId: id, status: result.status }, "Documents generated via API");
  res.json(result);
}));

// POST /api/applications/:id/answers — generate/answer application questions.
// Body: { questions: string[] }. Persists results to ApplicationAnswer.
applicationsRouter.post("/:id/answers", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await prisma.application.findFirst({ where: { id, userId: req.userId! }, include: { job: true } });
  if (!app) throw notFound("Application not found");

  const questions = Array.isArray(req.body?.questions)
    ? (req.body.questions as unknown[]).filter((q): q is string => typeof q === "string" && q.trim().length > 0)
    : [];
  if (!questions.length) throw badRequest("Provide a non-empty 'questions' array");

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

// POST /api/applications/:id/submit — drive the browser to fill (and, only if
// AUTO_SUBMIT is enabled, submit) the application form using the prepared package.
// Safety: blockers (CAPTCHA/login/OTP) and unsupported ATS surface as
// ASSISTED_REQUIRED/NEEDS_APPROVAL rather than being bypassed.
applicationsRouter.post("/:id/submit", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const id = req.params["id"] as string;
  const app = await prisma.application.findFirst({
    where: { id, userId: req.userId! },
    include: { documents: true, job: true },
  });
  if (!app) throw notFound("Application not found");

  const pkgDoc = app.documents.find((d) => d.type === "application_package");
  if (!pkgDoc?.content) throw badRequest("No application package — generate documents first");
  const pkg = JSON.parse(pkgDoc.content) as ApplicationPackage;

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

  // Map the automation result onto the application lifecycle.
  const statusMap: Record<string, string> = {
    submitted: "APPLIED",
    needs_user_action: "ASSISTED_REQUIRED",
    assisted_required: "ASSISTED_REQUIRED",
    failed: "FAILED",
  };
  const nextStatus = statusMap[result.status] ?? "ASSISTED_REQUIRED";
  await prisma.application.update({
    where: { id },
    data: {
      status: nextStatus as never,
      ...(result.status === "submitted" ? { appliedAt: new Date() } : {}),
      ...(result.status === "failed" ? { failureReason: result.reason } : {}),
    },
  });
  await prisma.applicationEvent.create({
    data: {
      applicationId: id,
      type: result.status === "submitted" ? "submitted" : "submit_attempted",
      description: result.reason,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      metadata: { blocker: result.blocker ?? null, filledFields: result.filledFields } as any,
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
