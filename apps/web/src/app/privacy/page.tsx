import type { Metadata } from "next";
import { REPO_URL } from "@prepo/shared";
import {
  Callout,
  FactList,
  Prose,
  StaticPage,
} from "@/components/marketing/static-page";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "Exactly what the Prepo demo stores, how long it keeps it, and what it never collects.",
};

export default function PrivacyPage() {
  return (
    <StaticPage
      eyebrow="Privacy"
      title="Privacy, in plain terms"
      intro="There is no analytics script, no tracker, no third-party embed and no mail provider in this app. This page lists what the database actually holds, because it is short enough to list."
      updated="Last reviewed with milestone 3 — two-factor sign-in"
    >
      <div className="space-y-12">
        <Callout title="The demo holds fictional data — please keep it fictional">
          <p>
            The hosted instance is a portfolio deployment. Every workspace in it comes from the
            seed script: two invented companies, invented people, invented meetings. Please do
            not put real confidential meeting content into the demo. Run it locally if you want
            to try it on your own material.
          </p>
        </Callout>

        <div>
          <Prose>
            <h2>What is stored when you sign in</h2>
          </Prose>
          <div className="mt-6">
            <FactList
              rows={[
                {
                  label: "Account",
                  value: "Name, email address, timezone, and an argon2id hash of your password (never the password)",
                },
                {
                  label: "Sessions",
                  value: "A device label derived from your user agent, a hash of that user agent, a truncated network prefix, and the time it was last used — one row per sign-in, so it can be revoked per device",
                },
                {
                  label: "Security events",
                  value: "An append-only log of sign-in, failure, revocation, two-factor and recovery-code events, with the same truncated network prefix",
                },
                {
                  label: "Two-factor, if you enable it",
                  value: "The TOTP secret, plus SHA-256 hashes of eight single-use recovery codes. The codes themselves are shown once and never stored",
                },
                {
                  label: "Cookies",
                  value: "One session cookie, and — mid-sign-in only — one short-lived challenge cookie. Both HttpOnly; there is no analytics or advertising cookie",
                },
              ]}
            />
          </div>
        </div>

        <Prose>
          <h2>What your IP address becomes</h2>
          <p>
            Addresses are truncated before they are written: the first three octets of an IPv4
            address (<code>203.0.113.42</code> is stored as <code>203.0.113</code>) and the first
            three groups of an IPv6 address. That is enough to notice that a session moved to a
            different network, and it is not enough to identify a household.
          </p>
        </Prose>

        <Prose>
          <h2>How long it is kept</h2>
          <p>
            Sessions expire after 30 days, or after 7 days of not being used, whichever comes
            first, and revocation takes effect immediately. A half-finished sign-in — the state
            between a correct password and a two-factor code — disappears in five minutes.
            Security events are append-only by design, which is what makes the rate limiting
            trustworthy, so they are the longest-lived record in the system.
          </p>
          <p>
            Your workspace’s data is yours to remove. Deleting a meeting, exporting a workspace
            and self-service account deletion are specified but not built yet; today, removing
            everything means deleting your account row, which cascades to your sessions.
          </p>
        </Prose>

        <Prose>
          <h2>What is never collected</h2>
          <ul>
            <li>No analytics, session-replay, heatmap or advertising scripts of any kind.</li>
            <li>
              No third-party services are wired up at all: no email provider, no speech-to-text,
              no model API, no error reporting. Every dependency is in the lockfile and
              auditable.
            </li>
            <li>No full IP addresses, no device fingerprints, no geolocation.</li>
            <li>
              No audio. The recording pipeline is milestone 4, so there is nothing to record and
              nothing to delete yet.
            </li>
            <li>
              Nothing is sold, shared or profiled. There is no business model here to profit
              from it.
            </li>
          </ul>
        </Prose>

        <Prose>
          <h2>When the pipeline does arrive</h2>
          <p>
            Recording, transcription and model calls are specified with privacy as a
            constraint rather than an afterthought: recordings delete themselves on a schedule,
            audio is reachable only through short-lived signed URLs after an authorization
            check, transcripts and audio go to no provider other than the one named here, and
            this page will list that provider by name before it is switched on.
          </p>
        </Prose>

        <Prose>
          <h2>Contact</h2>
          <p>
            Questions or corrections: open an issue on the{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              public repository
            </a>
            . Access, export and deletion requests for the demo instance are handled by the same
            route.
          </p>
        </Prose>
      </div>
    </StaticPage>
  );
}
