import type { ComponentType, ReactNode } from "react";
import { ArrowDown, Browser, DeviceMobile, Desktop } from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/section";
import { buttonVariants, type ButtonVariant } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TileIcon = ComponentType<{ size?: number; className?: string }>;

type Tile = {
  icon: TileIcon;
  title: string;
  body: string;
  cta: {
    label: string;
    href: string;
    variant: ButtonVariant;
    icon?: ReactNode;
  };
};

const TILES: Tile[] = [
  {
    icon: Browser,
    title: "Open in the browser",
    body: "No install and no signup — one click opens the seeded demo workspace with its credentials filled in.",
    cta: { label: "Try demo", href: "/demo", variant: "outline" },
  },
  {
    icon: DeviceMobile,
    title: "Install the app",
    body: "Not built yet: a browser will only install a site with a manifest and a service worker, and Prepo has neither — so there is no install prompt and nothing works offline.",
    cta: { label: "What's missing", href: "/download#install", variant: "outline" },
  },
  {
    icon: Desktop,
    title: "Build the desktop shell",
    body: "A native window with a tray, a global shortcut, prepo:// links and notifications. The source is in the repository; no installer is published, so you build it yourself.",
    cta: {
      label: "Build it",
      href: "/download#desktop",
      variant: "outline",
      icon: <ArrowDown size={15} weight="bold" />,
    },
  },
];

export function GetTheApp() {
  return (
    <Section id="download" className="border-t border-border">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl leading-tight tracking-tighter md:text-4xl">
          Get Prepo wherever you work
        </h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {TILES.map((tile) => (
          <div
            key={tile.title}
            className="flex flex-col rounded-2xl border border-border bg-surface p-6"
          >
            <tile.icon size={22} className="text-accent-ink" />
            <h3 className="mt-4 text-lg font-medium tracking-tight">{tile.title}</h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-text-muted">
              {tile.body}
            </p>
            <a
              href={tile.cta.href}
              className={cn(
                buttonVariants({ variant: tile.cta.variant, size: "md" }),
                "mt-6 justify-center",
              )}
            >
              {tile.cta.label}
              {tile.cta.icon}
            </a>
          </div>
        ))}
      </div>
    </Section>
  );
}
