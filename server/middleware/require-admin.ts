import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../lib/auth-middleware.js";
import { prisma } from "../lib/db.js";
import { config } from "../lib/config.js";

// Admin gate. Must run AFTER requireAuth (needs req.userId). Grants access when the
// user's email is in the ADMIN_EMAILS allowlist OR User.isAdmin is true. The
// allowlist bootstraps the first admin without a DB edit.
export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.userId) {
    res.status(401).json({ message: "Unauthorized" });
    return;
  }
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { isAdmin: true, email: true },
  });
  const allowlisted = user?.email ? config.admin.emails.includes(user.email.toLowerCase()) : false;
  if (!user || (!user.isAdmin && !allowlisted)) {
    res.status(403).json({ message: "Forbidden — admin access required" });
    return;
  }
  next();
}
