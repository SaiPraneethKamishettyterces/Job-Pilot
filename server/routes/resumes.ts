import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";
import Anthropic from "@anthropic-ai/sdk";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { env } from "../lib/env.js";
import { logger } from "../lib/logger.js";

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = (await import("pdf-parse")) as any;
    const fn = pdfParse.default ?? pdfParse;
    const buffer = await fs.readFile(filePath);
    const result = await fn(buffer);
    return result.text as string;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mammoth = (await import("mammoth")) as any;
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

const PARSE_PROMPT = `You are a resume parser. Extract structured information from the resume text below.

Return ONLY valid JSON matching this exact schema:
{
  "name": string,
  "email": string,
  "phone": string,
  "location": string,
  "linkedin": string,
  "github": string,
  "summary": string,
  "skills": string[],
  "experience": [{ "company": string, "title": string, "startDate": string, "endDate": string, "isCurrent": boolean, "description": string }],
  "education": [{ "institution": string, "degree": string, "field": string, "startYear": number, "endYear": number }],
  "projects": [{ "name": string, "description": string, "url": string, "technologies": string[] }],
  "certifications": string[]
}

IMPORTANT: Only extract information that is explicitly stated. Do not invent skills, dates, companies, or degrees.

Resume text:`;

resumesRouter.post("/upload-parse", requireAuth, upload.single("resume"), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ message: "No file uploaded" });
    return;
  }

  const filePath = req.file.path;
  const mimetype = req.file.mimetype;

  try {
    const rawText = await extractText(filePath, mimetype);

    if (!env.ANTHROPIC_API_KEY) {
      res.json({ message: "File uploaded", rawText: rawText.slice(0, 500), parsed: null });
      return;
    }

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      messages: [{ role: "user", content: `${PARSE_PROMPT}\n\n${rawText}` }],
    });

    const content = response.content[0];
    if (content.type !== "text") throw new Error("Unexpected response type");

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");

    const parsed = JSON.parse(jsonMatch[0]);
    logger.info({ userId: req.userId, fileName: req.file.originalname }, "Resume parsed");

    res.json({
      message: "Resume parsed successfully",
      fileName: req.file.originalname,
      rawText: rawText.slice(0, 200),
      parsed,
    });
  } catch (err) {
    logger.error({ err }, "Resume parse failed");
    res.status(500).json({ message: "Failed to parse resume" });
  } finally {
    fs.unlink(filePath).catch(() => {});
  }
});
