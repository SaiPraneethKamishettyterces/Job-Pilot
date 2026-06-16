import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import type { AuthRequest } from "../lib/auth-middleware.js";
import { config } from "../lib/config.js";

// Rate limiting. Two tiers:
//   • authLimiter  — per-IP, on /api/auth/* to blunt credential brute-force and
//     signup spam.
//   • aiLimiter    — per-user (falls back to IP) on endpoints that trigger a paid
//     Claude call, so a compromised/abusive account can't burn unbounded tokens.
// Disabled under NODE_ENV=test so the suite isn't throttled.

const base = {
  standardHeaders: "draft-7" as const,
  legacyHeaders: false,
  skip: () => config.isTest,
};

// Resolve a stable key: authenticated user id when present, else the client IP
// (via the IPv6-safe helper). Cloud Run sits behind a proxy → see trust proxy.
function userOrIpKey(req: Request): string {
  const uid = (req as AuthRequest).userId;
  if (uid) return `u:${uid}`;
  return ipKeyGenerator(req.ip ?? "");
}

export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60 * 1000, // 15 min
  limit: 20,
  message: { message: "Too many attempts. Please wait a few minutes and try again." },
});

export const aiLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60 * 1000, // 1 hour
  limit: 60,
  keyGenerator: userOrIpKey,
  message: { message: "AI usage rate limit reached. Please try again later." },
});
