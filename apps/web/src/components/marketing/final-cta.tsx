import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { BRAND, REPO_URL } from "@prepo/shared";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { cn } from "@/lib/utils";

const FOOTER_LINKS = [
  { label: "Privacy", href: "/privacy" },
  { label: "Terms", href: "/terms" },
  { label: "Security", href: "/security" },
  { label: "GitHub", href: REPO_URL, external: true },
  { label: "Download", href: "/download" },
] as const;

export function FinalCta() {
  return (
    <footer className="mt-8 bg-ink text-white">
      <Container className="py-16 md:py-24">
        <div className="flex flex-col items-start gap-8 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="max-w-xl text-3xl leading-tight tracking-tighter md:text-4xl">
            Stop chasing people after every meeting.
          </h2>
          <a href="/demo" className={cn(buttonVariants({ size: "lg" }), "shrink-0")}>
            Try demo
            <ArrowRight size={16} weight="bold" />
          </a>
        </div>

        <div className="mt-20 border-t border-white/10 pt-8">
          <div
            aria-hidden
            className="select-none text-[18vw] font-semibold leading-[0.8] tracking-tighter text-white/10 lg:text-[13rem]"
          >
            {BRAND.name}
          </div>
        </div>

        <div className="mt-8 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-sm text-white/60">
            {BRAND.tagline} Built by a developer, for developers.
          </p>
          <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                {...("external" in link && link.external
                  ? { target: "_blank", rel: "noreferrer" }
                  : {})}
                className="text-sm text-white/60 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
      </Container>
    </footer>
  );
}
