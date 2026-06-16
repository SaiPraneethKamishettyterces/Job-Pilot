import { logger } from "../../lib/logger.js";
import { config } from "../../lib/config.js";
import { prisma } from "../../lib/db.js";

// Provider-agnostic email notifications. The default "log" transport writes the
// message to the structured log — no provider keys required for local/test. A
// real provider (SMTP/SendGrid/SES) plugs in behind `deliver()` without changing
// any call sites. This is the seam, intentionally key-free per current scope.

export interface EmailMessage {
  to: string;
  subject: string;
  body: string;
}

async function deliver(msg: EmailMessage): Promise<void> {
  if (!config.notifications.emailEnabled) return;
  switch (config.notifications.emailTransport) {
    case "smtp":
      // Seam for a real SMTP/provider client. Not wired (no keys in scope).
      logger.warn({ to: msg.to, subject: msg.subject }, "Email transport 'smtp' selected but not configured — falling back to log");
      logger.info({ from: config.notifications.fromAddress, ...msg }, "EMAIL (would send via SMTP)");
      return;
    case "log":
    default:
      logger.info({ from: config.notifications.fromAddress, to: msg.to, subject: msg.subject, body: msg.body }, "EMAIL (log transport)");
      return;
  }
}

/** Look up a user's email, then deliver. Safe to call fire-and-forget. */
export async function emailUser(userId: string, subject: string, body: string): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user?.email) return;
    await deliver({ to: user.email, subject, body });
  } catch (err) {
    logger.warn({ userId, err: String(err) }, "Failed to send notification email");
  }
}

// ─── Notification templates ──────────────────────────────────────────────────

export async function notifyRunCompleted(
  userId: string,
  opts: { applications: number; needsApproval: number },
): Promise<void> {
  const subject =
    opts.needsApproval > 0
      ? `${opts.needsApproval} application${opts.needsApproval === 1 ? "" : "s"} ready for your review`
      : `Your job run is complete — ${opts.applications} application${opts.applications === 1 ? "" : "s"} prepared`;
  const body =
    `Your JobPilot run finished.\n\n` +
    `• Applications prepared: ${opts.applications}\n` +
    `• Awaiting your review: ${opts.needsApproval}\n\n` +
    (opts.needsApproval > 0
      ? "Open the Review Queue to approve and submit them."
      : "Open Applications to see what's ready.");
  await emailUser(userId, subject, body);
}
