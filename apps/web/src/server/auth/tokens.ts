import { createHash, randomBytes } from "node:crypto";

/** 256 bits of entropy, base64url so it survives a cookie unescaped. */
export function newSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Session and recovery-code secrets are stored hashed, never verbatim (§9.3 A02). */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function hashUserAgent(userAgent: string): string {
  return createHash("sha256").update(userAgent).digest("hex");
}
