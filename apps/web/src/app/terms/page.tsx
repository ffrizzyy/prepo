import type { Metadata } from "next";
import { REPO_URL } from "@prepo/shared";
import { Callout, Prose, StaticPage } from "@/components/marketing/static-page";

export const metadata: Metadata = {
  title: "Terms",
  description:
    "The terms for using the Prepo demo: what it is, what you may do with it, and what it does not promise.",
};

export default function TermsPage() {
  return (
    <StaticPage
      eyebrow="Terms"
      title="Terms of use"
      intro="Prepo is a portfolio project, not a company. There is no legal department behind this page, so it is written the way the rest of the project is: plainly, and without promising more than exists."
      updated="Last reviewed with milestone 3, two-factor sign-in"
    >
      <div className="space-y-10">
        <Callout title="The short version" tone="plain">
          <p>
            Use the demo to look around. Do not put anything confidential in it, do not attack it,
            and do not rely on it to keep your data, it may be reset without notice. Everything is
            provided as-is, with no warranty.
          </p>
        </Callout>

        <Prose>
          <h2>What this service is</h2>
          <p>
            Prepo is a web application developed in the open at{" "}
            <a href={REPO_URL} target="_blank" rel="noreferrer">
              ffrizzyy/prepo
            </a>
            . The hosted instance is a demonstration of that work, funded personally and provided at
            no cost. It is not a commercial product, there is no support agreement, and there is no
            service-level promise of any kind. Features described in the specification but not yet
            built do not exist, regardless of how they are described elsewhere.
          </p>

          <h2>Your account and your content</h2>
          <p>
            You keep whatever you put in. By using the demo you allow it to store and process that
            content for the purpose of running the app and nothing else, there are no third-party
            services involved to pass it to. You are responsible for having the right to upload
            anything you upload, including the consent of everyone in a recording.
          </p>
          <p>
            The seeded workspaces contain invented companies, invented people and invented meetings.
            They are fictional. Any resemblance to a real organisation is a coincidence of the seed
            script.
          </p>

          <h2>Acceptable use</h2>
          <ul>
            <li>
              Do not attack, scan, overload or attempt to break the demo, or use it to attack
              anything else. Security research is welcome, see{" "}
              <a href="/security">Security</a> for how to report a finding.
            </li>
            <li>
              Do not upload other people’s confidential material, or material you would not be
              comfortable losing, because it may be deleted at any time.
            </li>
            <li>
              Do not use the demo to send spam, to impersonate anyone, or to break the law.
            </li>
            <li>
              Requests are rate limited, and access may be withdrawn from an account that abuses
              the service. There is no appeals process: this is one person’s project.
            </li>
          </ul>

          <h2>Availability and data loss</h2>
          <p>
            The demo may go down, change, or have its data wiped, for example when a migration
            changes the schema, or when the seeded fixtures are reloaded. Treat everything in it as
            disposable. If you want to keep your own data, run the app locally; the{" "}
            <a href="/download">download page</a> explains how.
          </p>

          <h2>Intellectual property</h2>
          <p>
            The repository does not currently carry an open-source licence, so the default position
            applies: all rights reserved by the author. The code is public so that the work can be
            read and evaluated, not because it is free to reuse. If you would like to use any of it,
            open an issue on the repository and ask, for a portfolio project the answer is usually
            yes.
          </p>
          <p>
            “Prepo” and the logo are not registered trademarks and are not licensed to you. The
            phosphor icon set and the typefaces are used under their own licences, which are listed
            with the dependencies.
          </p>

          <h2>No warranty</h2>
          <p>
            The software and the hosted demo are provided <strong>as-is, without warranty of any
            kind</strong>, express or implied, including fitness for a particular purpose,
            accuracy, or non-infringement. To the extent the law allows, the author is not liable
            for any loss arising from using it or being unable to use it, including lost data,
            lost time, or lost profit.
          </p>

          <h2>Changes to these terms</h2>
          <p>
            These terms are a placeholder, and they will change as the project does; the date at
            the top of this page is when they were last looked at. There is no jurisdiction clause
            and no governing-law clause, because there is no entity to which one would attach, and
            nothing here is legal advice. If that matters to you, this is not the software for
            your use case.
          </p>

          <h2>Questions</h2>
          <p>
            Open an issue on the{" "}
            <a href={`${REPO_URL}/issues`} target="_blank" rel="noreferrer">
              repository
            </a>{" "}
           , it is the fastest route to an answer, and the answer will be in public.
          </p>
        </Prose>
      </div>
    </StaticPage>
  );
}
