import { runCli } from "./run";

/**
 * What every provider key on this machine is actually worth.
 *
 * A key being present and a key working are different claims, and this prints
 * them separately. `--live` makes one minimal authenticated request per
 * configured provider. That proves the credential is accepted — it does **not**
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
        detail: `refused (${response.status}) — ${message(body, text.slice(0, 160))}`,
      };
    }

    return { ok: true, detail: describe(body) };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    return { ok: false, detail: `unreachable — ${reason}` };
  }
}

const mask = (value: string) =>
  value.length <= 8 ? "•••" : `${value.slice(0, 4)}…${value.slice(-4)}`;

const PROBES: Probe[] = [
  {
    name: "deepgram",
    variable: "DEEPGRAM_API_KEY",
    what: "speech-to-text (milestone 4)",
    unconfigured:
      "recordings are stored but nothing is sent anywhere — upload or paste a transcript instead",
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
          return "key accepted · no sending domain — only Resend's own test sender can deliver, and only to your account address";
        }
        return `key accepted · ${domains.length} domain(s), ${verified.length} verified${
          verified.length ? ` (${verified.map((domain) => domain.name).join(", ")})` : ""
        }`;
      },
    }),
  },
  {
    name: "anthropic",
    variable: "ANTHROPIC_API_KEY",
    what: "meeting → tickets extraction (milestone 7, not built)",
    unconfigured: "expected — extraction does not exist yet, so the key just sits here",
    live: (key) => ({
      url: "https://api.anthropic.com/v1/models",
      init: { headers: { "x-api-key": key, "anthropic-version": "2023-06-01" } },
      describe: (body) => {
        const models = (body as { data?: unknown[] } | null)?.data ?? [];
        return `key accepted · ${models.length} model(s) listed`;
      },
    }),
  },
  {
    name: "linear",
    variable: "LINEAR_API_KEY",
    what: "two-way ticket sync (milestone 6, not built)",
    unconfigured: "expected — milestone 6 has not started",
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

  if (!live) {
    console.log("");
    console.log("Presence is not proof. Re-run with --live to make one real call each.");
    return;
  }

  console.log("");
  console.log("=== live checks (authenticated reads: no mail, no tokens billed, no audio) ===");

  const configured = PROBES.filter((probe) => probe.live && env[probe.variable]?.trim());
  if (configured.length === 0) {
    console.log("nothing to check — no provider key is set");
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
      ? "Every configured key was accepted. Acceptance is not delivery: an email still has to arrive and a recording still has to transcribe — the suites cover those once a key is set."
      : `${failed} key(s) were refused or unreachable, so nothing in the app can use them yet.`,
  );

  if (failed > 0) process.exitCode = 1;
});
