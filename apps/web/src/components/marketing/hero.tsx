import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { BRAND } from "@prepo/shared";
import { buttonVariants } from "@/components/ui/button";
import { Container } from "@/components/ui/section";
import { cn } from "@/lib/utils";
import { HeroPreview } from "./hero-preview";

export function Hero() {
  return (
    <section className="relative min-h-[100dvh] pt-24 pb-16 md:pt-32">
      <Container className="grid items-center gap-12 lg:grid-cols-[55fr_45fr] lg:gap-16">
        <div className="max-w-xl">
          <h1 className="text-balance text-4xl leading-none tracking-tighter md:text-5xl lg:text-6xl">
            The meeting ends.{" "}
            <span className="text-accent-ink">The work starts.</span>
          </h1>
          <p className="mt-6 max-w-[52ch] text-lg leading-relaxed text-text-muted">
            {BRAND.description}
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="/northwind" className={cn(buttonVariants({ size: "lg" }))}>
              Try demo
              <ArrowRight size={16} weight="bold" />
            </a>
            <a
              href="#how-it-works"
              className={cn(buttonVariants({ variant: "outline", size: "lg" }))}
            >
              See how it works
            </a>
          </div>
        </div>

        <HeroPreview />
      </Container>
    </section>
  );
}
