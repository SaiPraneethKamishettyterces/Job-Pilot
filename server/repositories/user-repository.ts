import { prisma } from "../lib/db.js";
import type { Prisma } from "@prisma/client";

// Data access for the User aggregate. Routes/controllers call these instead of
// touching `prisma` directly.
export const userRepository = {
  findByEmail: (email: string) => prisma.user.findUnique({ where: { email } }),

  findById: (id: string) => prisma.user.findUnique({ where: { id } }),

  /** Lightweight existence check (id only). */
  exists: (id: string) => prisma.user.findUnique({ where: { id }, select: { id: true } }),

  create: (data: { email: string; name: string; passwordHash: string }) =>
    prisma.user.create({ data }),

  update: (id: string, data: Prisma.UserUpdateInput) =>
    prisma.user.update({ where: { id }, data }),
};
