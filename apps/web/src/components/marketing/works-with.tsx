import { Container } from "@/components/ui/section";

const TOOLS = ["Linear", "Zoom", "Google Meet", "Microsoft Teams"];

export function WorksWith() {
  return (
    <section className="border-y border-border py-10">
      <Container className="flex flex-col items-center gap-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-text-subtle">
          Works with
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-x-10 gap-y-4">
          {TOOLS.map((tool) => (
            <li key={tool} className="text-base font-medium text-text-muted">
              {tool}
            </li>
          ))}
        </ul>
        <p className="max-w-[62ch] text-center text-xs leading-relaxed text-text-subtle">
          Linear is a live two-way integration. Zoom, Google Meet, and Microsoft Teams
          work by importing their transcripts or recordings.
        </p>
      </Container>
    </section>
  );
}
