import { Router } from "express";
import type { Prisma } from "@prisma/client";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, notFound } from "../lib/errors.js";
import { applicationRepository } from "../repositories/application-repository.js";
import { applicationUpdateSchema } from "../../shared/validation.js";

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
