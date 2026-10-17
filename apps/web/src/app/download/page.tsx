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
    "Where to run Prepo today: the hosted app, install it as a PWA, or run the repository locally.",
};

const OPTIONS = [
  {
    icon: Browser,
    title: "Use it in the browser",
    body: "The whole app is a web app. No install, no signup for the demo workspace.",
    cta: { label: "Open the demo", href: "/demo", variant: "primary" as const },
  },
  {
    icon: DeviceMobile,
    title: "Install it as an app",
    body: "Add Prepo to your home screen or dock from the browser. It opens without browser chrome and keeps its own window.",
    cta: { label: "Install instructions", href: "#install", variant: "outline" as const },
  },
  {
    icon: Terminal,
    title: "Run it yourself",
    body: "Clone the repository and run it on your machine — it needs nothing but Node and pnpm, because the default database is embedded.",
    cta: { label: "Read the README", href: `${REPO_URL}#readme`, variant: "outline" as const },
  },
];

const PLATFORM_STEPS: Array<{ platform: string; steps: string }> = [
  {
    platform: "Chrome · Edge · Brave (desktop)",
    steps:
      "Open the app, then choose Install from the address-bar icon, or the browser menu → “Install Prepo”.",
  },
  {
    platform: "Safari (macOS)",
    steps: "File → Add to Dock. Prepo then opens in its own window.",
  },
  {
    platform: "Safari (iOS)",
    steps: "Share → Add to Home Screen.",
  },
  {
    platform: "Chrome (Android)",
    steps: "Menu → Add to Home screen, or the inline install prompt.",
  },
];

export default function DownloadPage() {
  return (
    <StaticPage
      eyebrow="Download"
      title="Get Prepo running"
      intro="Prepo is a web app first. There is nothing to download to use it, and the desktop build is not shipped yet — this page says what each option really gives you today."
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
            <h2>Installing as an app</h2>
            <p>
              Prepo installs from the browser as a progressive web app: same code, same data,
              its own window and icon. It is the closest thing to a desktop app that exists
              today.
            </p>
          </Prose>
          <div className="mt-6">
            <FactList
              rows={PLATFORM_STEPS.map((step) => ({
                label: step.platform,
                value: step.steps,
              }))}
            />
          </div>
        </div>

        <Prose>
          <h2>Running it locally</h2>
          <p>
            The repository is a pnpm monorepo containing the web app and two small packages. The
            default database is PGlite — a real Postgres compiled to WebAssembly — so the whole
            thing runs with no Docker and no database to install.
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

        <Prose>
          <h2>Desktop app</h2>
          <p>
            A native desktop shell is specified — Tauri, for macOS, Windows and Linux, with a
            tray, a global shortcut and notifications. <strong>It is not built.</strong> The
            specification deliberately puts it late in the milestones, and the build machine has
            no Rust toolchain, so the shell and its code signing are CI-only work that has not
            been started.
          </p>
        </Prose>

        <Callout title="There are no installers to download">
          <p>
            No <code>.dmg</code>, <code>.msi</code> or <code>.AppImage</code> exists, and this
            page will not pretend otherwise. When the desktop build lands it will be published
            from{" "}
            <a
              href={`${REPO_URL}/releases`}
              target="_blank"
              rel="noreferrer"
              className="underline"
            >
              GitHub Releases
            </a>
            , signed, with the checksums alongside.
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
