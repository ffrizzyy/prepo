import { integratingKey } from "../linear/crypto";
import { runCli } from "./run";

/**
 * What every provider key on this machine is actually worth.
 *
 * A key being present and a key working are different claims, and this prints
 * them separately. `--live` makes one minimal authenticated request per
 * configured provider. That proves the credential is accepted, it does **not**
 * prove an email reaches an inbox, and the checks are chosen so nothing is sent,
 * nothing is billed and no audio is transcribed.
 *
 * No database is touched, so this runs while the dev server holds PGlite.
 */

type Live = {
  url: string;
  init: RequestInit;
  describe: (body: unknown) => string;
};

type Probe = {
  name: string;
  variable: string;
  what: string;
  unconfigured: string;
  /** Omitted where there is nothing to authenticate against yet. */
  live?: (key: string) => Live;
};

const message = (body: unknown, fallback: string) => {
  const stated = (body as { error?: { message?: string } } | null)?.error?.message;
  return String(stated ?? fallback ?? "no body")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
};

async function liveCheck({ url, init, describe }: Live) {
  try {
    const response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(15_000),
    });
    const text = await response.text();

    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }

    if (!response.ok) {
      return {
        ok: false,
        detail: `refused (${response.status}), ${message(body, text.slice(0, 160))}`,
      };
    }

    return { ok: true, detail: describe(body) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return { ok: false, detail: `unreachable, ${reason}` };
  }
}

/**
 * Enough to recognise *which* key it is (`sk-or-…` versus `lin_api_…`) and how
 * long it is, without the shape of the secret itself. A real key should not be
 * half-printed into a terminal log or a paste.
 */
const mask = (value: string) =>
  `${value.slice(0, 6)}… (${value.length} chars)`;

const PROBES: Probe[] = [
  {
    name: "deepgram",
    variable: "DEEPGRAM_API_KEY",
    what: "speech-to-text (milestone 4)",
    unconfigured:
      "recordings are stored but nothing is sent anywhere, upload or paste a transcript instead",
    live: (key) => ({
      url: "https://api.deepgram.com/v1/projects",
      init: { headers: { Authorization: `Token ${key}` } },
      describe: (body) => {
        const projects = (body as { projects?: unknown[] } | null)?.projects ?? [];
        return `key accepted · ${projects.length} project(s) visible`;
      },
    }),
  },
  {
    name: "resend",
    variable: "RESEND_API_KEY",
    what: "follow-up email (milestone 5)",
    unconfigured:
      "every email rung is recorded as failed, with that reason, while the in-app half still delivers",
    live: (key) => ({
      url: "https://api.resend.com/domains",
      init: { headers: { Authorization: `Bearer ${key}` } },
      describe: (body) => {
        const domains =
          (body as { data?: { name?: string; status?: string }[] } | null)?.data ?? [];
        const verified = domains.filter((domain) => domain.status === "verified");
        if (domains.length === 0) {
          return "key accepted · no sending domain, only Resend's own test sender can deliver, and only to your account address";
        }
        return `key accepted · ${domains.length} domain(s), ${verified.length} verified${
          verified.length ? ` (${verified.map((domain) => domain.name).join(", ")})` : ""
        }`;
      },
    }),
  },
  {
    name: "openrouter",
    variable: "OPENROUTER_API_KEY",
    what: "meeting → tickets extraction (milestone 7)",
    unconfigured:
      "expected, extraction is refused, and the meeting page names the missing variable",
    live: (key) => ({
      url: "https://openrouter.ai/api/v1/key",
      init: { headers: { Authorization: `Bearer ${key}` } },
      describe: (body) => {
        const info = (
          body as {
            data?: { usage?: number; limit?: number | null; is_free_tier?: boolean };
          } | null
        )?.data;
        const usage = typeof info?.usage === "number" ? info.usage : null;
        const limit = typeof info?.limit === "number" ? info.limit : null;
        const spend =
          usage === null
            ? "credit balance not reported"
            : limit === null
              ? `$${usage.toFixed(2)} used, no spend limit set`
              : `$${usage.toFixed(2)} used of $${limit.toFixed(2)}`;
        return `key accepted · ${spend}${
          info?.is_free_tier ? " · free tier" : ""
        }`;
      },
    }),
  },
  {
    name: "linear",
    variable: "LINEAR_API_KEY",
    what: "two-way ticket sync (milestone 6)",
    unconfigured: "expected, the integrations page refuses to connect without one",
    live: (key) => ({
      url: "https://api.linear.app/graphql",
      init: {
        method: "POST",
        // A personal key goes in raw; an OAuth token would need `Bearer `.
        headers: { Authorization: key, "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ viewer { id name } }" }),
      },
      describe: (body) => {
        const viewer = (body as { data?: { viewer?: { name?: string } } } | null)?.data
          ?.viewer;
        return viewer?.name
          ? `key accepted · authenticated as ${viewer.name}`
          : "key accepted";
      },
    }),
  },
];

runCli("providers.ts", async () => {
  const env = process.env;
  const live = process.argv.includes("--live");

  console.log("=== keys on this machine ===");
  for (const probe of PROBES) {
    const value = env[probe.variable]?.trim() ?? "";
    console.log(
      `${probe.name.padEnd(10)} ${(value ? `set (${mask(value)})` : "not set").padEnd(21)} ${probe.what}`,
    );
    if (!value) console.log(`${" ".repeat(11)}→ ${probe.unconfigured}`);
  }

  // Not a provider key, so it is never masked by prefix: six hex characters of a
  // key is six characters too many. Its only property worth printing is whether
  // it can be used at all, and that question is answered by the same function the
  // integration asks.
  const keyState = !env.INTEGRATION_ENCRYPTION_KEY?.trim()
    ? "not set"
    : integratingKey(env)
      ? "set (32 bytes)"
      : "set but invalid";
  console.log(
    `${"crypto".padEnd(10)} ${keyState.padEnd(21)} encrypts stored Linear tokens (milestone 6)`,
  );
  if (keyState !== "set (32 bytes)") {
    console.log(
      `${" ".repeat(11)}→ connecting Linear is refused until this is a 32-byte key (openssl rand -hex 32, or 32 bytes base64); nothing is ever stored in plaintext`,
    );
  }

  if (!live) {
    console.log("");
    console.log("Presence is not proof. Re-run with --live to make one real call each.");
    return;
  }

  console.log("");
  console.log("=== live checks (authenticated reads: no mail, no tokens billed, no audio) ===");

  const configured = PROBES.filter((probe) => probe.live && env[probe.variable]?.trim());
  if (configured.length === 0) {
    console.log("nothing to check, no provider key is set");
    return;
  }

  let failed = 0;
  for (const probe of configured) {
    const result = await liveCheck(probe.live!(env[probe.variable]!.trim()));
    if (!result.ok) failed += 1;
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${probe.name.padEnd(10)} ${result.detail}`);
  }

  console.log("");
  console.log(
    failed === 0
      ? "Every configured key was accepted. Acceptance is not delivery: an email still has to arrive and a recording still has to transcribe, the suites cover those once a key is set."
      : `${failed} key(s) were refused or unreachable, so nothing in the app can use them yet.`,
  );

  if (failed > 0) process.exitCode = 1;
});
