import jwt from "jsonwebtoken";
import { config } from "./config.js";

// Short-lived, signed action tokens for out-of-band flows (password reset, email
// verification). Stateless (no DB table): the JWT signature + expiry are the
// guard. Scoped by `purpose` so a reset token can't be used to verify email and
// vice-versa.

export type ActionPurpose = "pwreset" | "verify";

interface ActionPayload {
  sub: string;
  purpose: ActionPurpose;
}

export function signActionToken(userId: string, purpose: ActionPurpose, expiresIn = "1h"): string {
  const opts: jwt.SignOptions = { expiresIn: expiresIn as jwt.SignOptions["expiresIn"] };
  return jwt.sign({ sub: userId, purpose }, config.auth.jwtSecret, opts);
}

/** Verify a token and return the userId if valid for `purpose`, else null. */
export function verifyActionToken(token: string, purpose: ActionPurpose): string | null {
  try {
    const decoded = jwt.verify(token, config.auth.jwtSecret) as ActionPayload;
    if (decoded.purpose !== purpose || !decoded.sub) return null;
    return decoded.sub;
  } catch {
    return null;
  }
}
