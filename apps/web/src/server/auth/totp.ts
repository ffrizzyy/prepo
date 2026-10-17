import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * RFC 6238 TOTP, with SHA-1 and six digits — the pair every authenticator app
 * defaults to. Verified against the RFC's own test vectors in `db:auth` rather
 * than trusting the implementation because it looks right.
 */

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
/** The RFC's 30-second step. */
const STEP = 30;

export function base32Encode(bytes: Uint8Array): string {
  let output = "";
  let bits = 0;
  let value = 0;

  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

/** Tolerant of the formatting an authenticator app shows the secret in. */
export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (const character of clean) {
    const index = BASE32_ALPHABET.indexOf(character);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((value >>> bits) & 0xff);
    }
  }

  return Buffer.from(bytes);
}

/**160 bits of secret — thirty base32 characters, like an authenticator expects. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number, digits: number): string {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", secret).update(buffer).digest();
  const offset = digest[digest.length - 1]! & 0x0f;

  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);

  return String(binary % 10 ** digits).padStart(digits, "0");
}

/** Exposed for the RFC 6238 test vectors, which are given as Unix seconds. */
export function totpAt(
  secret: string,
  unixSeconds: number,
  digits = 6,
): string {
  return hotp(base32Decode(secret), Math.floor(unixSeconds / STEP), digits);
}

export function currentTotp(secret: string): string {
  return totpAt(secret, Math.floor(Date.now() / 1000));
}

/**
 * Accepts the neighbouring step on either side, so a hand-held clock a second or
 * two out of step still gets in. Always whole codes, never prefixes.
 */
export function verifyTotp(
  secret: string,
  code: string,
  window = 1,
): boolean {
  const digits = code.length;
  if (digits !== 6 && digits !== 8) return false;

  const now = Math.floor(Date.now() / 1000);
  const candidates = [0];
  for (let step = 1; step <= window; step += 1) {
    candidates.push(step, -step);
  }

  for (const offset of candidates) {
    const expected = Buffer.from(totpAt(secret, now + offset * STEP, digits));
    const presented = Buffer.from(code);
    if (expected.length === presented.length && timingSafeEqual(expected, presented)) {
      return true;
    }
  }
  return false;
}

/** The URI an authenticator app reads from a QR code, or a pasted secret. */
export function otpauthUrl(email: string, secret: string): string {
  const label = encodeURIComponent(`Prepo:${email}`);
  const parameters = new URLSearchParams({
    secret,
    issuer: "Prepo",
    algorithm: "SHA1",
    digits: "6",
    period: "30",
  });
  return `otpauth://totp/${label}?${parameters}`;
}

/* ------------------------------------------------------------ recovery */

const RECOVERY_CODE_COUNT = 8;

/** Ten characters over the same alphabet an authenticator shows, with a dash. */
function recoveryCode(): string {
  const characters = base32Encode(randomBytes(10)).slice(0, 10);
  return `${characters.slice(0, 5)}-${characters.slice(5)}`;
}

export function generateRecoveryCodes(
  count = RECOVERY_CODE_COUNT,
): string[] {
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    codes.push(recoveryCode());
  }
  return codes;
}

/**
 * Whatever the user typed, reduce it to the canonical form the hash was computed
 * over: no spaces, no dashes, upper case.
 */
export function normalizeCode(value: string): string {
  return value.replace(/[\s-]/g, "").toUpperCase();
}

/** Recovery codes are stored hashed, like session tokens, for the same reason. */
export function hashRecoveryCode(code: string): string {
  return createHash("sha256").update(normalizeCode(code)).digest("hex");
}
