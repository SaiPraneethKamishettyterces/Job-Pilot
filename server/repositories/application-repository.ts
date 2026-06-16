import { prisma } from "../lib/db.js";
import type { Prisma } from "@prisma/client";

// Data access for the Application aggregate.
export const applicationRepository = {
  /** Paginated list + total count for a filter. */
  findManyAndCount: (where: Prisma.ApplicationWhereInput, take: number, skip: number) =>
    Promise.all([
      prisma.application.findMany({ where, orderBy: { createdAt: "desc" }, take, skip }),
      prisma.application.count({ where }),
    ]),

  /** Find an application that belongs to a given user (ownership check). */
  findOwned: (id: string, userId: string) =>
    prisma.application.findFirst({ where: { id, userId } }),

  update: (id: string, data: Prisma.ApplicationUpdateInput) =>
    prisma.application.update({ where: { id }, data }),
};
