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

export const resumesRouter = Router();

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
