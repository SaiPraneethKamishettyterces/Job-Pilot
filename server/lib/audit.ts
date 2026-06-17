import { prisma } from "./db.js";
import { logger } from "./logger.js";

// Append-only audit trail for sensitive account operations (data export, account
// deletion, …). Writes to the AuditLog table, whose `userId` has no FK so the
// record survives the user's own deletion.
//
// Auditing must never break the user-facing operation: failures are logged and
// swallowed, never thrown.
export async function recordAudit(
  userId: string,
  action: string,
  detail?: string | null,
  ipAddress?: string | null,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: { userId, action, detail: detail ?? null, ipAddress: ipAddress ?? null },
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), userId, action },
      "Failed to write audit log",
    );
  }
}
