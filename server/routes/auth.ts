import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { z } from "zod";
import { env } from "../lib/env.js";

export const authRouter = Router();

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// In-memory store for dev — replace with Prisma in production
const users = new Map<string, { id: string; email: string; name: string; passwordHash: string; onboardingDone: boolean }>();

function makeToken(userId: string) {
  return jwt.sign({ userId }, env.JWT_SECRET, { expiresIn: "30d" });
}

authRouter.post("/signup", async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Invalid input" });
    return;
  }
  const { email, password, name } = parsed.data;

  if ([...users.values()].some((u) => u.email === email)) {
    res.status(409).json({ message: "Email already in use" });
    return;
  }

  const id = `u_${Date.now()}`;
  const passwordHash = await bcrypt.hash(password, 12);
  const user = { id, email, name, passwordHash, onboardingDone: false };
  users.set(id, user);

  const token = makeToken(id);
  res.json({ token, user: { id, email, name, onboardingDone: false, createdAt: new Date().toISOString() } });
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid input" });
    return;
  }
  const { email, password } = parsed.data;

  const user = [...users.values()].find((u) => u.email === email);
  if (!user) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ message: "Invalid email or password" });
    return;
  }

  const token = makeToken(user.id);
  res.json({
    token,
    user: { id: user.id, email: user.email, name: user.name, onboardingDone: user.onboardingDone, createdAt: new Date().toISOString() },
  });
});

authRouter.post("/me", (req, res) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) { res.status(401).json({ message: "Unauthorized" }); return; }
  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as { userId: string };
    const user = users.get(payload.userId);
    if (!user) { res.status(404).json({ message: "User not found" }); return; }
    res.json({ id: user.id, email: user.email, name: user.name, onboardingDone: user.onboardingDone });
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
});
