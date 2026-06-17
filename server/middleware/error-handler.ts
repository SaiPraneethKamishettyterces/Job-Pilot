import type { ErrorRequestHandler, RequestHandler } from "express";
import { AppError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { captureException } from "../lib/error-reporter.js";

const isProd = process.env.NODE_ENV === "production";

// JSON 404 for unmatched API routes (mount under /api).
export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ message: "Not found" });
};

// Central error handler. Must be registered LAST. Produces a consistent JSON
// error shape and — unlike the old per-route catches — never leaks internal
// DB/error detail to clients in production.
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  // A streaming/SSE response may have already started; defer to Express.
  if (res.headersSent) return next(err);

  if (err instanceof AppError) {
    if (err.statusCode >= 500) {
      logger.error({ err: err.message, path: req.path }, "Application error");
    }
    res.status(err.statusCode).json({
      message: err.message,
      ...(err.code ? { code: err.code } : {}),
    });
    return;
  }

  const message = err instanceof Error ? err.message : "Unknown error";

  // Preserve the prior "Database unavailable" (503) behavior for Prisma errors,
  // detected by class name to avoid coupling to Prisma internals.
  const isDbError = err instanceof Error && err.name.startsWith("PrismaClient");
  if (isDbError) {
    logger.error({ err: message, path: req.path }, "Database error");
    res.status(503).json({
      message: "Database unavailable",
      ...(isProd ? {} : { detail: message }),
    });
    return;
  }

  // Unexpected/unhandled → route through the error-reporting seam (the place a
  // real tracker like Sentry plugs in).
  captureException(err, { path: req.path, method: req.method });
  res.status(500).json({ message: isProd ? "Internal server error" : message });
};
