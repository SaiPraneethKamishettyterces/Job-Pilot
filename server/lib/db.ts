import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { logger } from "./logger.js";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Opt-in slow-query logging: set SLOW_QUERY_MS to a positive threshold (ms) to
// emit a warn line for any query at or above it. Off by default (0) so normal
// runs and tests stay quiet.
const SLOW_QUERY_MS = Number(process.env.SLOW_QUERY_MS ?? "0");

function createPrismaClient() {
  const url = process.env.DATABASE_URL;
  // Use a placeholder URL when DATABASE_URL is not set so the server still starts;
  // queries will fail gracefully with a 503 instead of crashing on import.
  const connectionString = url ?? "postgresql://localhost:5432/jobpilot_dev";
  const adapter = new PrismaPg({ connectionString });
  const client = new PrismaClient({
    adapter,
    log:
      SLOW_QUERY_MS > 0
        ? [{ level: "query", emit: "event" }, { level: "warn", emit: "stdout" }, { level: "error", emit: "stdout" }]
        : process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
  });

  if (SLOW_QUERY_MS > 0) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (client as any).$on("query", (e: { duration: number; query: string }) => {
      if (e.duration >= SLOW_QUERY_MS) {
        logger.warn({ durationMs: e.duration, query: e.query }, "Slow query");
      }
    });
  }

  return client;
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
