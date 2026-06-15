import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { AppError, badRequest } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { hasAnthropic, completeJson } from "../services/ai/ai-service.js";
import { TASK_MODEL } from "../services/ai/model-config.js";
import { RESUME_PARSE_PROMPT } from "../services/ai/prompts.js";

export const resumesRouter = Router();

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
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
    cb(null, allowed.includes(file.mimetype));
  },
});

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

resumesRouter.post("/upload-parse", requireAuth, upload.single("resume"), asyncHandler(async (req: AuthRequest, res) => {
  if (!req.file) throw badRequest("No file uploaded");

  const filePath = req.file.path;
  const mimetype = req.file.mimetype;
  const fileName = req.file.originalname;

  try {
    const rawText = await extractText(filePath, mimetype);

    if (!hasAnthropic()) {
      res.json({ message: "File uploaded", rawText: rawText.slice(0, 500), parsed: null });
      return;
    }

    const { data: parsed } = await completeJson({
      model: TASK_MODEL.resumeParse,
      maxTokens: 4096,
      messages: [{ role: "user", content: `${RESUME_PARSE_PROMPT}\n\n${rawText}` }],
    });
    logger.info({ userId: req.userId, fileName }, "Resume parsed");

    res.json({
      message: "Resume parsed successfully",
      fileName,
      rawText: rawText.slice(0, 200),
      parsed,
    });
  } catch (err) {
    // Log the detail server-side; return a clean message (no internal leak).
    const msg = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err: msg }, "Resume parse failed");
    throw new AppError(500, "Failed to parse resume");
  } finally {
    // Always remove the uploaded temp file, success or failure.
    fs.unlink(filePath).catch(() => {});
  }
}));
