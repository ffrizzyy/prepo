import type { Metadata } from "next";
import { ArrowRight, Browser, DeviceMobile, Desktop, Download as DownloadIcon, GithubLogo, Terminal } from "@phosphor-icons/react/dist/ssr";
import { REPO_URL } from "@prepo/shared";
import {
  Callout,
  FactList,
  Prose,
  StaticPage,
} from "@/components/marketing/static-page";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Download",
  description:
    "What runs today: the web app, the desktop shell's source, and the repository you can run on your own machine.",
};

const OPTIONS = [
  {
    icon: Browser,
    title: "Use it in the browser",
    body: "The whole product is a web app. No install, and the demo workspace needs no signup.",
    cta: { label: "Open the demo", href: "/demo", variant: "primary" as const },
  },
  {
    icon: DeviceMobile,
    title: "Install it as an app",
    body: "Not built yet. A browser will only install a site that ships a web app manifest and a service worker, and Prepo has neither — so there is no install prompt and nothing works offline.",
    cta: { label: "What's missing", href: "#install", variant: "outline" as const },
  },
  {
    icon: Desktop,
    title: "Build the desktop shell",
    body: "The Tauri shell is in the repository and its configuration is checked. No installer is published, so building it yourself is the only way to run it.",
    cta: { label: "How to build it", href: "#desktop", variant: "outline" as const },
  },
];

const DESKTOP_STEPS: Array<{ label: string; value: string }> = [
  {
    label: "Needs",
    value:
      "Rust (stable) and, on Windows, the MSVC build tools. WebView2 already ships with Windows 10 and 11.",
  },
  {
    label: "Build it",
    value:
      "pnpm install, then pnpm --filter @prepo/desktop build. The installer is written under apps/desktop/src-tauri/target/release/bundle.",
  },
  {
    label: "Run it",
    value:
      "pnpm dev in one terminal, then pnpm --filter @prepo/desktop dev in another — the shell has nothing to show until the app answers.",
  },
  {
    label: "Point it elsewhere",
    value:
      "Set PREPO_DESKTOP_URL, and add that origin to connect-src in apps/desktop/src-tauri/tauri.conf.json. The shell's own page checks the address before it hands the window over.",
  },
];

export default function DownloadPage() {
  return (
    <StaticPage
      eyebrow="Download"
      title="Get Prepo running"
      intro="Prepo is a web app first, and the desktop shell is source you build yourself. Nothing here is downloadable yet, and this page says what each option really gives you today."
    >
      <div className="space-y-14">
        <div className="grid gap-4 md:grid-cols-3">
          {OPTIONS.map((option) => (
            <div
              key={option.title}
              className="flex flex-col rounded-2xl border border-border bg-surface p-6"
            >
              <option.icon size={22} className="text-accent-ink" />
              <h2 className="mt-4 text-lg font-medium tracking-tight">{option.title}</h2>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
                {option.body}
              </p>
              <a
                href={option.cta.href}
                {...(option.cta.href.startsWith("http")
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className={cn(
                  buttonVariants({ variant: option.cta.variant, size: "md" }),
                  "mt-6 justify-center",
                )}
              >
                {option.cta.label}
                <ArrowRight size={15} weight="bold" />
              </a>
            </div>
          ))}
        </div>

        <div id="install" className="scroll-mt-24">
          <Prose>
            <h2>Installing as an app is not built</h2>
            <p>
              An installable web app needs four pieces: a manifest describing the name, icons and
              window, a service worker to serve the shell offline, icons in the sizes each platform
              asks for, and a prompt that offers the install without nagging. Prepo has none of
              them, so no browser will offer to install it and no page will load without a network.
            </p>
            <p>
              It is not a trick of the build: <code>public/</code> is empty and there is no service
              worker anywhere in the source. The same missing service worker is why nothing is
              pushed to your devices — push subscriptions are delivered through one.
            </p>
          </Prose>
        </div>

        <div id="desktop" className="scroll-mt-24">
          <Prose>
            <h2>The desktop shell</h2>
            <p>
              <code>apps/desktop</code> is a Tauri 2 shell: a native window around the web app, plus
              the four things a browser cannot do — a tray menu, a global shortcut (
              <code>Ctrl/⌘ + Shift + R</code> opens the recorder), <code>prepo://</code> links, and
              native notifications. A second launch focuses the open window instead of opening
              another, window position is remembered, and a link to any other site opens in your
              browser rather than inside a window that carries your session.
            </p>
            <p>
              It holds no product logic and no data of its own, and{" "}
              <strong>no command is exposed to the page in the window</strong> — not even to the app
              it wraps — so nothing the app renders can reach the tray, the filesystem or the
              updater. The shell watches the app; the app does not drive the shell.
            </p>
            <p className="text-text-muted">
              What is missing: no installer is published or signed, no update endpoint or signing
              key is configured (so <em>Check for updates</em> says exactly that), the scheme is
              registered through the installer an installed build would have, and the shell has not
              been run through a release. Its behaviour is covered by Rust tests for the rules it
              enforces and by {""}
              <code>pnpm --filter @prepo/desktop verify</code> for its configuration.
            </p>
          </Prose>
          <div className="mt-6">
            <FactList rows={DESKTOP_STEPS} />
          </div>
        </div>

        <Prose>
          <h2>Running it locally</h2>
          <p>
            The repository is a pnpm monorepo containing the web app, the desktop shell and two
            small packages. The default database is PGlite — a real Postgres compiled to
            WebAssembly — so the whole thing runs with no Docker and no database to install.
          </p>
          <p>
            <code>pnpm install</code> then <code>pnpm --filter @prepo/web db:verify</code> to
            create the schema and load the seeded workspaces, then <code>pnpm dev</code>. Set{" "}
            <code>DATABASE_URL</code> if you would rather point it at a real Postgres.
          </p>
          <p>
            The{" "}
            <a href={`${REPO_URL}#readme`} target="_blank" rel="noreferrer">
              README
            </a>{" "}
            has the full set of scripts, the seeded demo credentials, and the list of what is
            built so far.
          </p>
        </Prose>

        <Callout title="There are no installers to download">
          <p>
            No <code>.dmg</code>, <code>.msi</code> or <code>.AppImage</code> exists, and this
            page will not pretend otherwise. The shell&apos;s source is in the repository today; a
            published, signed build will be the release that adds files here and checksums
            alongside them on{" "}
            <a
              href={`${REPO_URL}/releases`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              GitHub Releases
            </a>
            .
          </p>
        </Callout>

        <Prose>
          <h2>Browsers</h2>
          <p>
            Any current version of Chrome, Edge, Firefox or Safari. Pages are server-rendered,
            and the flows that matter for getting in — sign-in, sign-up, creating a workspace,
            signing out and revoking a device — are plain HTML forms that submit and work with
            JavaScript switched off. The board and the review queue are interactive clients: they
            update optimistically when you drag a ticket or approve an item, so they need
            JavaScript.
          </p>
        </Prose>

        <div className="flex flex-wrap gap-3">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: "ink", size: "md" })}
          >
            <GithubLogo size={16} weight="bold" />
            View the source
          </a>
          <a href="/demo" className={buttonVariants({ variant: "primary", size: "md" })}>
            <DownloadIcon size={16} weight="bold" />
            Try demo
          </a>
        </div>
      </div>
    </StaticPage>
  );
}
