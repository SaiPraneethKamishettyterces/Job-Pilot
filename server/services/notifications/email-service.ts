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

// Cached nodemailer transport (created on first SMTP send).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let smtpTransport: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getSmtpTransport(): Promise<any> {
  if (smtpTransport) return smtpTransport;
  const { smtp } = config.notifications;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const nodemailer = (await import("nodemailer")) as any;
  smtpTransport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  return smtpTransport;
}

async function deliver(msg: EmailMessage): Promise<void> {
  if (!config.notifications.emailEnabled) return;
  const { emailTransport, fromAddress, smtp } = config.notifications;

  // SMTP only when actually configured; otherwise fall back to log so dev/test
  // never silently require a provider.
  if (emailTransport === "smtp" && smtp.host) {
    const transport = await getSmtpTransport();
    await transport.sendMail({ from: fromAddress, to: msg.to, subject: msg.subject, text: msg.body });
    logger.info({ to: msg.to, subject: msg.subject }, "EMAIL sent via SMTP");
    return;
  }
  if (emailTransport === "smtp" && !smtp.host) {
    logger.warn("NOTIFY_EMAIL_TRANSPORT=smtp but SMTP_HOST is unset — falling back to log transport");
  }
  logger.info({ from: fromAddress, to: msg.to, subject: msg.subject, body: msg.body }, "EMAIL (log transport)");
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

export async function sendPasswordResetEmail(userId: string, resetUrl: string): Promise<void> {
  await emailUser(
    userId,
    "Reset your JobPilot password",
    `We received a request to reset your password.\n\nReset it here (link expires in 1 hour):\n${resetUrl}\n\nIf you didn't request this, you can ignore this email.`,
  );
}

export async function sendVerificationEmail(userId: string, verifyUrl: string): Promise<void> {
  await emailUser(
    userId,
    "Verify your JobPilot email",
    `Welcome to JobPilot! Please verify your email address:\n\n${verifyUrl}\n\nThis link expires in 24 hours.`,
  );
}

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
