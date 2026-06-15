import type { RequestHandler } from "express";
import { logger } from "../lib/logger.js";

// Logs one structured line per request once the response finishes:
// method, path, status, and latency in ms.
export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    logger.info(
      {
        method: req.method,
        path: req.originalUrl,
        status: res.statusCode,
        ms: Date.now() - start,
      },
      "request",
    );
  });
  next();
};
