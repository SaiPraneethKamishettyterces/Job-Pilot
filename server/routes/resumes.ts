import { Router, type Response, type NextFunction } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { AppError, badRequest } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { hasProvider, completeJson } from "../services/ai/ai-service.js";
import { TASK_MODEL } from "../services/ai/model-config.js";
import { RESUME_PARSE_PROMPT } from "../services/ai/prompts.js";
import { ingestResume, type ParsedResume } from "../services/profile/resume-ingest.js";
import { prisma } from "../lib/db.js";

export const resumesRouter = Router();

// ─── Editable structured resume content ──────────────────────────────────────
// Stored under Resume.parsedJson.resumeContent. The raw AI parse stays in
// parsedJson alongside it; the editor reads/writes only resumeContent. On first
// open we derive resumeContent from whatever the parser produced (migration).
interface SkillGroup { category: string; skills: string[] }
interface ExperienceItem { company: string; title: string; location: string; startDate: string; endDate: string; current: boolean; bullets: string[] }
interface ProjectItem { name: string; org: string; link: string; bullets: string[] }
interface EducationItem { institution: string; degree: string; location: string; gpa: string; achievements: string[]; coursework: string[] }
interface ResumeContent {
  targetJobTitle: string;
  name: string; email: string; phone: string; location: string;
  summary: string;
  skillGroups: SkillGroup[];
  experience: ExperienceItem[];
  projects: ProjectItem[];
  education: EducationItem[];
}

function str(v: unknown): string { return typeof v === "string" ? v : typeof v === "number" ? String(v) : ""; }
function bullets(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string") return v.split(/\n+/).map((s) => s.replace(/^[-•·]\s*/, "").trim()).filter(Boolean);
  return [];
}
function obj(v: unknown): Record<string, unknown> { return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {}; }
function arr(v: unknown): unknown[] { return Array.isArray(v) ? v : []; }

// Derive an editable doc from the freeform parse the AI/profile produced.
function deriveContent(parsed: Record<string, unknown>): ResumeContent {
  const skillsRaw = arr(parsed.skills);
  const flatSkills = skillsRaw.map((s) => (typeof s === "string" ? s : str(obj(s).name))).filter(Boolean);
  return {
    targetJobTitle: str(parsed.targetJobTitle),
    name: str(parsed.fullName) || str(parsed.name),
    email: str(parsed.email),
    phone: str(parsed.phone),
    location: str(parsed.location),
    summary: str(parsed.summary),
    skillGroups: flatSkills.length ? [{ category: "Skills", skills: flatSkills }] : [],
    experience: arr(parsed.experience).map((e) => {
      const o = obj(e);
      return {
        company: str(o.company), title: str(o.title || o.role), location: str(o.location),
        startDate: str(o.startDate), endDate: str(o.endDate), current: Boolean(o.isCurrent),
        bullets: bullets(o.achievements).length ? bullets(o.achievements) : bullets(o.description),
      };
    }),
    projects: arr(parsed.projects).map((p) => {
      const o = obj(p);
      return { name: str(o.name), org: str(o.org || o.company), link: str(o.url || o.link), bullets: bullets(o.description) };
    }),
    education: arr(parsed.education).map((ed) => {
      const o = obj(ed);
      const degree = [str(o.degree), str(o.field)].filter(Boolean).join(", ");
      return { institution: str(o.institution), degree, location: str(o.location), gpa: str(o.gpa), achievements: bullets(o.achievements), coursework: bullets(o.coursework) };
    }),
  };
}

function contentOf(parsedJson: unknown): ResumeContent {
  const p = obj(parsedJson);
  if (p.resumeContent && typeof p.resumeContent === "object") return p.resumeContent as ResumeContent;
  return deriveContent(p);
}

async function ownedResume(userId: string, id: string) {
  const resume = await prisma.resume.findUnique({ where: { id } });
  if (!resume || resume.userId !== userId) return null;
  return resume;
}

// GET /api/resumes — list (no parsed content, just summary fields for the table).
resumesRouter.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const rows = await prisma.resume.findMany({
    where: { userId: req.userId! },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });
  res.json({
    resumes: rows.map((r) => ({
      id: r.id,
      fileName: r.fileName,
      isPrimary: r.isPrimary,
      analysisComplete: r.parsedJson != null,
      targetJobTitle: contentOf(r.parsedJson).targetJobTitle || null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
    limit: 5, // ponytail: plan-based slot limit; fixed for now.
  });
}));

// GET /api/resumes/:id — full editable content.
resumesRouter.get("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const resume = await ownedResume(req.userId!, String(req.params.id));
  if (!resume) throw badRequest("Resume not found");
  res.json({
    resume: { id: resume.id, fileName: resume.fileName, isPrimary: resume.isPrimary, content: contentOf(resume.parsedJson) },
  });
}));

// PATCH /api/resumes/:id — save edited content / rename.
resumesRouter.patch("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const resume = await ownedResume(req.userId!, String(req.params.id));
  if (!resume) throw badRequest("Resume not found");
  const body = req.body as { fileName?: string; content?: ResumeContent };
  const existing = obj(resume.parsedJson);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = {};
  if (typeof body.fileName === "string" && body.fileName.trim()) data.fileName = body.fileName.trim();
  if (body.content && typeof body.content === "object") data.parsedJson = { ...existing, resumeContent: body.content };
  const updated = await prisma.resume.update({ where: { id: resume.id }, data });
  res.json({ resume: { id: updated.id, fileName: updated.fileName, isPrimary: updated.isPrimary, content: contentOf(updated.parsedJson) } });
}));

// POST /api/resumes/:id/primary — make this the primary resume.
resumesRouter.post("/:id/primary", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const resume = await ownedResume(req.userId!, String(req.params.id));
  if (!resume) throw badRequest("Resume not found");
  await prisma.$transaction([
    prisma.resume.updateMany({ where: { userId: req.userId!, isPrimary: true }, data: { isPrimary: false } }),
    prisma.resume.update({ where: { id: resume.id }, data: { isPrimary: true } }),
  ]);
  res.json({ ok: true });
}));

// DELETE /api/resumes/:id
resumesRouter.delete("/:id", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const resume = await ownedResume(req.userId!, String(req.params.id));
  if (!resume) throw badRequest("Resume not found");
  await prisma.resume.delete({ where: { id: resume.id } });
  res.json({ ok: true });
}));

const ALLOWED_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
];
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const upload = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      const dir = path.join(process.cwd(), "uploads");
      await fs.mkdir(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}-${file.originalname.replace(/[^a-z0-9.]/gi, "_")}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter: (_req, file, cb) => {
    // Reject with a tagged error so the wrapper can return a clear 400 instead of
    // silently dropping the file (which surfaced as a confusing "No file uploaded").
    if (ALLOWED_TYPES.includes(file.mimetype)) return cb(null, true);
    cb(new Error("UNSUPPORTED_FILE_TYPE"));
  },
});

// Wrap multer so its rejections (wrong type, too big) become clean 400s with a
// message the UI can show the user verbatim.
function uploadResume(req: AuthRequest, res: Response, next: NextFunction) {
  upload.single("resume")(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return next(badRequest("Resume is too large. The maximum size is 10 MB."));
    }
    if (err instanceof Error && err.message === "UNSUPPORTED_FILE_TYPE") {
      return next(badRequest("Unsupported file type. Please upload a PDF or DOCX resume."));
    }
    return next(err);
  });
}

async function extractText(filePath: string, mimetype: string): Promise<string> {
  if (mimetype === "application/pdf") {
    // pdf-parse v2 exposes a PDFParse class (the old callable default was removed).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { PDFParse } = (await import("pdf-parse")) as any;
    const buffer = await fs.readFile(filePath);
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return (result.text as string) ?? "";
    } finally {
      await parser.destroy?.();
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import("mammoth")) as any;
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

resumesRouter.post("/upload-parse", requireAuth, uploadResume, asyncHandler(async (req: AuthRequest, res) => {
  if (!req.file) throw badRequest("No file uploaded");

  const filePath = req.file.path;
  const mimetype = req.file.mimetype;
  const fileName = req.file.originalname;

  try {
    const rawText = await extractText(filePath, mimetype);

    // A near-empty extraction usually means a scanned/image-only PDF (no text
    // layer) or a corrupt file — tell the user specifically rather than failing
    // generically later.
    if (rawText.trim().length < 20) {
      throw badRequest(
        "Couldn't read any text from this file. If it's a scanned PDF (image only), upload a text-based PDF or a DOCX.",
      );
    }

    // Parse with Claude when available; otherwise persist the raw text only so
    // resume tailoring still has a base resume to work from.
    let parsed: ParsedResume | null = null;
    if (hasProvider(TASK_MODEL.resumeParse.provider)) {
      const { data } = await completeJson({
        ...TASK_MODEL.resumeParse,
        maxTokens: 4096,
        messages: [{ role: "user", content: `${RESUME_PARSE_PROMPT}\n\n${rawText}` }],
      });
      parsed = data as ParsedResume;
    }

    // Persist the Resume row (rawText → tailoring) and auto-populate any blank
    // profile fields from the parse (non-destructive).
    const { resumeId, filledFields } = await ingestResume(req.userId!, parsed, {
      fileName,
      fileType: mimetype,
      originalFileUrl: fileName,
      rawText,
    });
    logger.info({ userId: req.userId, fileName, resumeId, filledFields }, "Resume ingested");

    res.json({
      message: parsed ? "Resume parsed and saved" : "Resume saved (parsing unavailable)",
      fileName,
      resumeId,
      rawText: rawText.slice(0, 200),
      parsed,
      autoPopulatedFields: filledFields,
    });
  } catch (err) {
    // Clean client errors (unsupported format, empty/scanned file) pass through
    // with their specific message; only unexpected failures collapse to a 500.
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: msg }, "Resume parse failed");
    throw new AppError(500, "Failed to parse resume");
  } finally {
    // Always remove the uploaded temp file, success or failure.
    fs.unlink(filePath).catch(() => {});
  }
}));
