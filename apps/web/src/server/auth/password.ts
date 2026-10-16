import { randomBytes } from "node:crypto";
import { argon2id, argon2Verify } from "hash-wasm";

/**
 * OWASP's argon2id recommendation: 19 MiB, two iterations, one lane
 * (PREPO.md §9.3 A02). `memorySize` is in KiB.
 */
const PARAMETERS = {
  parallelism: 1,
  iterations: 2,
  memorySize: 19456,
  hashLength: 32,
} as const;

export async function hashPassword(password: string): Promise<string> {
  return argon2id({
    password,
    salt: new Uint8Array(randomBytes(16)),
    outputType: "encoded",
    ...PARAMETERS,
  });
}

export async function verifyPassword(
  password: string,
  hash: string,
): Promise<boolean> {
  try {
    return await argon2Verify({ password, hash });
  } catch {
    // A malformed stored hash is a failed verification, never a crash.
    return false;
  }
}

let dummy: Promise<string> | null = null;

/**
 * Verifying against this when no account exists keeps the response time of a
 * known and an unknown address in the same range, so sign-in cannot be used to
 * enumerate which emails have accounts.
 */
export function dummyPasswordHash(): Promise<string> {
  dummy ??= hashPassword("prepo-dummy-password-never-matches");
  return dummy;
}
