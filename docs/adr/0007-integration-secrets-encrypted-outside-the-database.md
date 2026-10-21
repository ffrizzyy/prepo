# ADR 0007: Integration secrets are encrypted with a key the database does not hold

- Status: Accepted. Recorded 21 October 2026.
- Supersedes: none.

## Context

A workspace's Linear connection needs a personal API key to pull and push, and
the webhook needs the signing secret Linear generated for that workspace. Both
are credentials: a database dump, a backup copy or a read-only SQL injection must
not be enough to use them. The alternative, storing them as text, is one
`select *` away from a leak.

## Decision

AES-256-GCM, with the key in the environment and a versioned envelope in the
column.

- `encryptSecret` produces `v1.<iv>.<ciphertext>.<tag>`, all base64. The version
  prefix exists so a re-key can tell old rows from new ones.
- `integratingKey` accepts exactly 32 bytes, hex or base64, from
  `INTEGRATION_ENCRYPTION_KEY`. Anything else is refused rather than padded, and
  there is no default and no plaintext fallback: without the key, connecting
  Linear fails with that reason instead of writing something it cannot protect.
- `decryptSecret` returns null on a wrong key or tampered ciphertext rather than
  throwing, so a broken row becomes "this connection cannot be used", not a
  crashing page.
- The webhook secret is stored the same way and verified per workspace:
  HMAC-SHA256 over the raw body, compared in constant time, with a 60-second
  timestamp window. A missing secret refuses the delivery; it is never treated
  as "verification not required".
- Row-level security keeps the encrypted column inside its tenant (ADR 0001).

## Consequences

- A database-only compromise yields ciphertext. An environment-only compromise
  yields a key with nothing to decrypt. Both together yield the tokens, as with
  any application-held key.
- Losing `INTEGRATION_ENCRYPTION_KEY` makes existing connections unreadable. The
  recovery is to re-enter the token, which is a deliberate, visible action; there
  is no recovery backdoor.
- Key rotation is manual. The version prefix makes it possible (decrypt with the
  old key, re-encrypt with the new one), but no rotation command exists yet.
- The key is read from the process environment, so a leaked `.env.local` or a
  leaked deployment environment is a token leak. The file is git-ignored and
  gitleaks scans history, but those are detection, not protection.
- Only integration secrets use this. Session tokens are hashed (not encrypted)
  because the server never needs to read them back; passwords are hashed with
  argon2id via `hash-wasm` (OWASP's 19 MiB / two iterations / one lane setting).

## Alternatives considered

- **A KMS/secret manager.** Rejected for this repository: no hosted deployment
  to attach one to. The interface (`integratingKey`) is the place a KMS would
  plug in.
- **Hashing the Linear token.** Impossible: the app must send it to Linear.
- **Encrypting in the application with a key stored in the database.** Rejected:
  that is obfuscation, not encryption.

## Evidence

`apps/web/src/server/linear/crypto.ts`,
`apps/web/src/server/linear/webhook.ts` (`MAX_AGE_MS`, `verifySignature`),
`apps/web/src/server/linear/sync.ts` (`connectLinear`, token storage),
`apps/web/src/app/api/integrations/linear/webhook/route.ts`,
`SECURITY.md` (A02 row).
