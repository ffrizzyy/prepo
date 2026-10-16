import { ArrowUpRight } from "@phosphor-icons/react/dist/ssr";
import { SECURITY_PILLARS } from "@prepo/shared";
import { Eyebrow, Section } from "@/components/ui/section";

export function Security() {
  return (
    <Section id="security" className="border-t border-border">
      <div className="mb-12 max-w-2xl">
        <Eyebrow>Security</Eyebrow>
        <h2 className="text-3xl leading-tight tracking-tighter md:text-4xl">
          Built like it holds your meeting recordings
        </h2>
        <p className="mt-3 text-text-muted">
          Because it does. Prepo targets OWASP ASVS Level 2 and the OWASP Top 10 for LLM
          applications.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {SECURITY_PILLARS.map((pillar) => (
          <div key={pillar.title} className="rounded-2xl border border-border bg-surface p-6">
            <h3 className="text-lg font-medium tracking-tight">{pillar.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">{pillar.body}</p>
          </div>
        ))}
      </div>

      <a
        href="/security"
        className="mt-6 inline-flex items-center gap-1.5 text-sm text-accent-ink hover:underline"
      >
        Read the security model
        <ArrowUpRight size={15} weight="bold" />
      </a>
    </Section>
  );
}
