import type { Metadata } from "next";
import { Callout, FactList, Prose, StaticPage } from "@/components/marketing/static-page";

export const metadata: Metadata = {
  title: "Security",
  description:
    "How Prepo protects accounts, keeps workspaces apart, and stays honest about what is not built yet.",
};

export default function SecurityPage() {
  return (
    <StaticPage
      eyebrow="Security"
      title="The security model, as built"
      intro="Prepo holds meeting recordings, so it is designed as though it holds yours. This page describes the mechanisms that are actually implemented, what they do not cover, and where the source is."
      updated="Last reviewed with milestone 3 — two-factor sign-in"
    >
      <div className="space-y-10">
        <Prose>
          <h2>Accounts and sessions</h2>
          <p>
            Passwords are hashed with <strong>argon2id</strong> at OWASP’s recommended
            parameters, using per-hash salts. A sign-in attempt against an address that has no
            account still runs a full verification against a decoy hash and returns exactly the
            same message as a wrong password, so neither the response time nor the wording
            reveals whether an account exists.
          </p>
          <p>
            Sessions are database rows, not self-describing tokens. Sign-in mints 256 bits of
            randomness, sends it in an <code>HttpOnly</code> cookie, and stores only its
            SHA-256 — a database dump therefore does not hand over live sessions. Every request
            re-reads the session from Postgres and checks that it is unrevoked and inside both
            its absolute and idle lifetimes, so revoking a device takes effect on that device’s
            very next request. Sign-in rotates the session, and sign-out, revoke-one and
            revoke-the-others all write an audit event.
          </p>
          <p>
            Two-factor authentication is TOTP (RFC 6238), enabled per account from settings and
            confirmed with a code from the user’s authenticator before it takes effect. It
            issues eight single-use recovery codes, shown once and stored hashed. When a
            factor-protected account signs in, a correct password does <em>not</em> mint a
            session: it creates a five-minute login challenge that is worthless without the
            authenticator.
          </p>
          <p>
            Failed attempts are counted from an append-only event log rather than from mutable
            counters, so throttling cannot be reset by racing it. Codes are accepted with a
            one-step drift window either side of the current thirty seconds.
          </p>
        </Prose>

        <FactList
          rows={[
            { label: "Password hashing", value: "argon2id, 19 MiB memory, t=2, p=1" },
            { label: "Session token", value: "256-bit random, stored as SHA-256 only" },
            { label: "Session lifetime", value: "30 days absolute, 7 days idle" },
            { label: "Cookie", value: "HttpOnly, SameSite=Lax, Path=/; __Host- and Secure in production" },
            { label: "Sign-in limit", value: "5 per minute per address, 20 per minute per network" },
            { label: "Second-factor limit", value: "5 per minute per account" },
            { label: "Login challenge", value: "5 minutes, single-use, hashed at rest" },
          ]}
        />

        <Prose>
          <h2>Workspace isolation</h2>
          <p>
            Every tenant table carries a <code>workspace_id</code> with row-level security
            enabled <em>and forced</em>. Policies compare against a session setting, so an unset
            scope denies by default. The application never queries as the table owner: each
            request-scoped transaction switches to a dedicated non-owner role and sets the
            workspace with <code>set local</code>, so a pooled connection cannot leak tenancy
            into the next request.
          </p>
          <p>
            On top of the database boundary, the server checks membership before rendering a
            workspace. A non-member gets a <strong>404, not a 403</strong> — the app never
            confirms that somebody else’s workspace exists. Cross-tenant reads and writes are
            asserted by the test suite on both the embedded engine and a real Postgres.
          </p>
        </Prose>

        <Prose>
          <h2>Secrets, logs and data</h2>
          <p>
            Anything that can be used to authenticate is stored hashed: session tokens,
            second-factor recovery codes, login challenges, API keys, invitation and share
            tokens. Audit logs are append-only and workspace-scoped; identity events such as
            sign-ins are recorded separately, because a sign-in happens before a workspace is
            known.
          </p>
          <p>
            Network addresses are truncated to a prefix — three octets of an IPv4 address — and
            user agents are stored as a hash plus a human-readable device label. That is enough
            to notice a device change, without keeping a record of who connected from where.
          </p>
        </Prose>

        <Prose>
          <h2>The agent</h2>
          <p>
            Extracted action items arrive with their supporting evidence and a confidence
            score, and nothing becomes a ticket without passing the workspace’s autonomy
            setting — which defaults to requiring human approval. Every write the app makes is
            recorded as an audit event attributed to a user or to <code>prepo-agent</code>, and
            the agent’s outputs are treated as untrusted input rather than instructions.
          </p>
        </Prose>

        <Callout title="What is not built yet">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              Passkeys (WebAuthn), Google and GitHub OAuth, and magic-link sign-in. Sign-in is
              email and password, plus TOTP.
            </li>
            <li>
              Email verification, password reset, and a breached-password check. Without a
              mail provider there is no way to prove control of an address.
            </li>
            <li>
              Turnstile or any other bot challenge on the sign-in form.
            </li>
            <li>
              Replay protection inside a single TOTP time step, and rate limiting keyed to the
              challenge token itself rather than the account.
            </li>
            <li>
              Encryption at rest at the application layer, and audio retention controls — the
              recording pipeline is milestone 4, so there is no audio to delete yet.
            </li>
          </ul>
        </Callout>

        <Prose>
          <h2>Reporting a problem</h2>
          <p>
            This is a portfolio project without a bug-bounty programme. If you find something,
            please open an issue on the{" "}
            <a
              href="https://github.com/ffrizzyy/prepo/issues"
              target="_blank"
              rel="noreferrer"
            >
              public repository
            </a>
            , or use GitHub’s private vulnerability reporting if the report should not be
            public. The <code>SECURITY.md</code> in the repository records the current posture
            against the OWASP ASVS checklist, including the items still open.
          </p>
        </Prose>
      </div>
    </StaticPage>
  );
}
