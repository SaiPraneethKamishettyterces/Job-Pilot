import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { env } from "../lib/env.js";
import { requireAuth, type AuthRequest } from "../lib/auth-middleware.js";
import { asyncHandler } from "../lib/async-handler.js";
import { badRequest, conflict, notFound, unauthorized } from "../lib/errors.js";
import { userRepository } from "../repositories/user-repository.js";
import { signupSchema, loginSchema, updateNameSchema } from "../../shared/validation.js";

export const authRouter = Router();

function makeToken(userId: string) {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "30d" });
}

function safeUser(u: { id: string; email: string; name: string | null; avatarUrl: string | null; onboardingDone: boolean; createdAt: Date }) {
  return { id: u.id, email: u.email, name: u.name ?? "", avatarUrl: u.avatarUrl, onboardingDone: u.onboardingDone, createdAt: u.createdAt.toISOString() };
}

authRouter.post("/signup", asyncHandler(async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) throw badRequest(parsed.error.issues[0]?.message ?? "Invalid input");
  const { email, password, name } = parsed.data;

  const existing = await userRepository.findByEmail(email);
  if (existing) throw conflict("Email already in use");

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await userRepository.create({ email, name, passwordHash });

  res.json({ token: makeToken(user.id), user: safeUser(user) });
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
