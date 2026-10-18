import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

/**
 * Integration tokens are encrypted with AES-256-GCM before they touch a column,
 * and the key lives outside the database (PREPO.md 9.3 A02). There is no
 * fallback to plaintext, no "encrypt later" and no default key: without
 * `INTEGRATION_ENCRYPTION_KEY` this deployment cannot store a Linear token at
 * all, and it says so instead of quietly writing something it cannot protect.
 *
 * The stored value carries its version and its IV, so a future re-key can tell
 * old rows from new ones:
 *
 *   v1.<iv base64>.<ciphertext base64>.<auth tag base64>
 */

const VERSION = "v1";
export const ENCRYPTION_KEY_VARIABLE = "INTEGRATION_ENCRYPTION_KEY";

export type EncryptionKey = { key: Buffer; source: string };

/**
 * Takes a plain string map rather than `ProcessEnv`, so a caller can pass
 * `process.env` or a literal in a test without pretending to be one.
 */
export type EncryptionEnv = Record<string, string | undefined>;

/** Base64 or hex, exactly 32 bytes. Anything else is refused, not padded. */
export function integratingKey(env: EncryptionEnv): EncryptionKey | null {
  const raw = env[ENCRYPTION_KEY_VARIABLE]?.trim();
  if (!raw) return null;

  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, "hex")
    : Buffer.from(raw, "base64");

  if (key.length !== 32) return null;
  return { key, source: /^[0-9a-fA-F]{64}$/.test(raw) ? "hex" : "base64" };
}

export function encryptSecret(
  plaintext: string,
  { key }: EncryptionKey,
): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, ciphertext, tag]
    .map((part) => (typeof part === "string" ? part : part.toString("base64")))
    .join(".");
}

/**
 * Returns null rather than throwing: a row that cannot be decrypted (wrong key,
 * tampered ciphertext) is a connection we cannot use, which the caller reports
 * as such instead of crashing a page.
 */
export function decryptSecret(
  stored: string | null,
  { key }: EncryptionKey,
): string | null {
  if (!stored) return null;

  const parts = stored.split(".");
  if (parts.length !== 4 || parts[0] !== VERSION) return null;

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(parts[1]!, "base64"),
    );
    decipher.setAuthTag(Buffer.from(parts[3]!, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(parts[2]!, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Constant-time comparison for secrets a caller supplied. Length is compared
 * first because timingSafeEqual throws on a mismatch, which would itself be a
 * (loud) leak.
 */
export function secretEquals(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
