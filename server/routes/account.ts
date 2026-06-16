import { Router } from "express";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { notFound } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { prisma } from "../lib/db.js";

export const accountRouter = Router();

// GET /api/account/export — full export of the authenticated user's data (GDPR
// "right to access / data portability"). Returns a single JSON document.
accountRouter.get("/export", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      preferences: true,
      resumes: true,
      subscription: { include: { plan: true } },
      subscriptionEvents: true,
      applications: {
        include: { documents: true, answers: true, events: true },
      },
      usageEvents: true,
    },
  });
  if (!user) throw notFound("User not found");

  // Redact the password hash from the export.
  const { passwordHash: _omit, ...safeUser } = user as Record<string, unknown> & { passwordHash?: string };

  const payload = {
    exportedAt: new Date().toISOString(),
    schema: "jobpilot.account-export.v1",
    user: safeUser,
  };

  logger.info({ userId }, "Account data exported");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Content-Disposition", `attachment; filename="jobpilot-export-${userId}.json"`);
  res.send(JSON.stringify(payload, null, 2));
}));

// DELETE /api/account — permanently delete the user and all related data.
// All relations cascade on delete via the Prisma schema (onDelete: Cascade).
accountRouter.delete("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const userId = req.userId!;
  const exists = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!exists) throw notFound("User not found");

  await prisma.user.delete({ where: { id: userId } });
  logger.info({ userId }, "Account permanently deleted");
  res.json({ message: "Account deleted" });
}));
