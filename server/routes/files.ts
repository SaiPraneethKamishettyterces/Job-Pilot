import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { forbidden, notFound } from "../lib/errors.js";
import { getArtifact } from "../services/storage/artifact-storage.js";

export const filesRouter = Router();

const MIME_BY_EXT: Record<string, string> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  json: "application/json",
  txt: "text/plain",
};

// GET /api/files/applications/:userId/:jobId/:name — download a stored artifact.
// Ownership is enforced from the key: the storage layout is
// applications/<userId>/<...>, so the userId segment must match the caller.
filesRouter.get(
  "/applications/:userId/*",
  requireAuth,
  asyncHandler(async (req: AuthRequest, res) => {
    const ownerId = req.params["userId"] as string;
    if (ownerId !== req.userId) throw forbidden("Not your file");

    // Reconstruct the storage key from the matched path.
    const key = req.path.replace(/^\//, "");
    const bytes = await getArtifact(key);
    if (!bytes) throw notFound("File not found");

    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    res.setHeader("Content-Type", MIME_BY_EXT[ext] ?? "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${key.split("/").pop()}"`);
    res.send(bytes);
  }),
);
