/**
 * Test fixture, not part of the demo: adds one dedicated account with
 * two-factor already switched on, so HTTP-level tests can exercise the second
 * step of sign-in without touching the demo flow (lena and nadia stay
 * factors-free). Prints recovery codes and leaves the database seeded plus
 * this account:
 *   pnpm --filter @prepo/web db:totp-fixture
 */
import {
  createUserWithPassword,
  enableTotp,
  storePendingTotpSecret,
} from "../auth/accounts";
import { hashPassword } from "../auth/password";
import {
  currentTotp,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
} from "../auth/totp";
import { migrateAndApply } from "./migrate";
import { runCli } from "./run";
import { seed } from "./seed";
import { createWorkspaceWithOwner } from "./repo";

const FIXTURE = {
  email: "tessa@totp.test",
  password: "totp-fixture-pass-2026",
  name: "Tessa Second-Factor",
  workspaceName: "Second Factor Co",
  workspaceSlug: "second-factor",
  ticketPrefix: "SFC",
  /** Four codes are plenty for probing; the remaining four stay unissued. */
  recoveryCodeCount: 4,
};

runCli("totp-fixture.ts", async () => {
  await migrateAndApply();
  await seed();

  // seed() truncates every table, so a leftover from an earlier run cannot
  // survive to collide with this one.
  const passwordHash = await hashPassword(FIXTURE.password);
  const { userId } = await createUserWithPassword({
    email: FIXTURE.email,
    name: FIXTURE.name,
    passwordHash,
    timezone: "UTC",
  });

  await createWorkspaceWithOwner({
    name: FIXTURE.workspaceName,
    slug: FIXTURE.workspaceSlug,
    ownerId: userId,
    ticketPrefix: FIXTURE.ticketPrefix,
  });

  // Enrolment as the settings flow does it: issue a secret, then switch the
  // factor on once a code has checked out. The secret itself never reaches the
  // log — only a currently-valid six-digit code, for HTTP tests to hand back.
  // It stays valid for ±30s around its step, which is enough to start a probe
  // right after this script exits.
  const secret = generateTotpSecret();
  await storePendingTotpSecret(userId, secret);
  const recoveryCodes = generateRecoveryCodes(FIXTURE.recoveryCodeCount);
  await enableTotp({
    userId,
    recoveryCodeHashes: recoveryCodes.map(hashRecoveryCode),
  });

  console.log(
    `✓ fixture ready: ${FIXTURE.email} / ${FIXTURE.password}, workspace /${FIXTURE.workspaceSlug}`,
  );
  console.log(`recovery codes: ${recoveryCodes.join(" ")}`);
  console.log(`live totp code: ${currentTotp(secret)}`);
});
