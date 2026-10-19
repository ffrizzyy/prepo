import type { Metadata } from "next";
import { ArrowRight, MagnifyingGlass } from "@phosphor-icons/react/dist/ssr";
import { Prose, StaticPage } from "@/components/marketing/static-page";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page does not exist.",
};

const NEXT_STEPS = [
  {
    label: "Back to the homepage",
    href: "/",
    detail: "What Prepo does, how it works, and what is built so far.",
  },
  {
    label: "Open the demo workspace",
    href: "/demo",
    detail: "A seeded workspace with the credentials already filled in.",
  },
  {
    label: "Sign in",
    href: "/sign-in",
    detail: "If you already have an account, this takes you to your workspaces.",
  },
];

export default function NotFound() {
  return (
    <StaticPage
      eyebrow="404"
      title="That page doesn’t exist"
      intro="The address you followed doesn’t match anything here. It may have been mistyped, or it may point at something that has not been built yet."
    >
      <div className="space-y-12">
        <div className="grid gap-3 md:grid-cols-3">
          {NEXT_STEPS.map((step) => (
            <a
              key={step.href}
              href={step.href}
              className="group flex flex-col rounded-3 border border-border bg-surface p-5 transition-colors hover:border-border-strong"
            >
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-text">
                {step.label}
                <ArrowRight
                  size={14}
                  weight="bold"
                  className="text-text-subtle transition-transform duration-200 group-hover:translate-x-0.5"
                />
              </span>
              <span className="mt-2 text-sm leading-relaxed text-text-muted">{step.detail}</span>
            </a>
          ))}
        </div>

        <Prose>
          <h2>If you followed a link from inside the app</h2>
          <p>
            Workspaces are private. If you are signed in and open a workspace you are not a member
            of, you get this page on purpose: answering “you don’t have access” would confirm that
            the workspace exists. A link that worked before may also have been deleted, moved, or
            renamed since you saved it.
          </p>
          <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.18em] text-text-subtle">
            <MagnifyingGlass size={14} />
            Check the address, then try one of the routes above
          </p>
        </Prose>

        <div className="flex flex-wrap gap-3">
          <a href="/" className={cn(buttonVariants({ variant: "primary", size: "md" }))}>
            Back to the homepage
          </a>
          <a href="/demo" className={cn(buttonVariants({ variant: "outline", size: "md" }))}>
            Try the demo
          </a>
        </div>
      </div>
    </StaticPage>
  );
}
