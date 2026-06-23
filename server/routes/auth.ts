import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../lib/config.js";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, conflict, notFound, unauthorized } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { userRepository } from "../repositories/user-repository.js";
import { signActionToken, verifyActionToken } from "../lib/tokens.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../services/notifications/email-service.js";
import {
  signupSchema,
  loginSchema,
  updateNameSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  verifyEmailSchema,
} from "../../shared/validation.js";

export const authRouter = Router();

// Single source of truth for session-token expiry (was hardcoded "30d").
function makeToken(userId: string) {
  const opts: jwt.SignOptions = { expiresIn: config.auth.jwtExpiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ userId }, config.auth.jwtSecret, opts);
}

function safeUser(u: {
  id: string; email: string; name: string | null; avatarUrl: string | null;
  isAdmin?: boolean; onboardingDone: boolean; emailVerified?: boolean; createdAt: Date;
}) {
  return {
    id: u.id, email: u.email, name: u.name ?? "", avatarUrl: u.avatarUrl,
    isAdmin: u.isAdmin ?? false,
    onboardingDone: u.onboardingDone, emailVerified: u.emailVerified ?? false,
    createdAt: u.createdAt.toISOString(),
  };
}

// Build a UI URL for an emailed action link, from the first configured origin.
function uiUrl(path: string): string {
  const origin = config.server.uiOrigin.split(",")[0]?.trim() || "http://localhost:5173";
  const base = origin === "*" ? "http://localhost:5173" : origin;
  return `${base}${path}`;
}

authRouter.post("/signup", asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  const { email, password, name } = parsed.data;

  const existing = await userRepository.findByEmail(email);
  if (existing) throw conflict("Email already in use");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await userRepository.create({ email, name, passwordHash });

  // Fire-and-forget email verification (non-gating).
  const verifyToken = signActionToken(user.id, "verify", "24h");
  void sendVerificationEmail(user.id, uiUrl(`/verify-email?token=${verifyToken}`));

  res.json({ token: makeToken(user.id), user: safeUser(user) });
}));

// POST /api/auth/forgot-password — email a reset link. Always returns 200 (never
// reveals whether an account exists).
authRouter.post("/forgot-password", asyncHandler(async (req, res) => {
  const parsed = forgotPasswordSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("A valid email is required");
  const user = await userRepository.findByEmail(parsed.data.email);
  if (user) {
    const token = signActionToken(user.id, "pwreset", "1h");
    void sendPasswordResetEmail(user.id, uiUrl(`/reset-password?token=${token}`));
    logger.info({ userId: user.id }, "Password reset requested");
  }
  res.json({ message: "If that email is registered, a reset link has been sent." });
}));

// POST /api/auth/reset-password — set a new password from a valid reset token.
authRouter.post("/reset-password", asyncHandler(async (req, res) => {
  const parsed = resetPasswordSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  const userId = verifyActionToken(parsed.data.token, "pwreset");
  if (!userId) throw badRequest("This reset link is invalid or has expired. Request a new one.");
  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await userRepository.update(userId, { passwordHash });
  logger.info({ userId }, "Password reset completed");
  res.json({ message: "Password updated. You can now log in." });
}));

// POST /api/auth/verify-email — mark the account's email verified from a token.
authRouter.post("/verify-email", asyncHandler(async (req, res) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid verification token");
  const userId = verifyActionToken(parsed.data.token, "verify");
  if (!userId) throw badRequest("This verification link is invalid or has expired.");
  await userRepository.update(userId, { emailVerified: true, emailVerifiedAt: new Date() });
  res.json({ message: "Email verified." });
}));

// POST /api/auth/resend-verification — re-send the verification email (auth'd).
authRouter.post("/resend-verification", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const token = signActionToken(req.userId!, "verify", "24h");
  void sendVerificationEmail(req.userId!, uiUrl(`/verify-email?token=${token}`));
  res.json({ message: "Verification email sent." });
}));

authRouter.post("/login", asyncHandler(async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid input");
  const { email, password } = parsed.data;

  const user = await userRepository.findByEmail(email);
  if (!user || !user.passwordHash) throw unauthorized("Invalid email or password");

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) throw unauthorized("Invalid email or password");

  res.json({ token: makeToken(user.id), user: safeUser(user) });
}));

authRouter.get("/me", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const user = await userRepository.findById(req.userId!);
  if (!user) throw notFound("User not found");
  res.json(safeUser(user));
}));

authRouter.patch("/me", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const parsed = updateNameSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest("Invalid input");

  const user = await userRepository.update(req.userId!, parsed.data);
  res.json(safeUser(user));
}));
