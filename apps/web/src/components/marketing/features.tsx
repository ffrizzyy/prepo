import {
  ChartLineUp,
  MagicWand,
  PaperPlaneTilt,
  Sparkle,
  Translate,
} from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/section";
import { cn } from "@/lib/utils";

function Cell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border p-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Features() {
  return (
    <Section id="features" className="border-t border-border">
      <div className="mb-12 max-w-2xl">
        <h2 className="text-3xl leading-tight tracking-tighter md:text-4xl">
          Everything between the meeting and the done column
        </h2>
      </div>

      <div className="grid gap-4 lg:grid-cols-6">
        <Cell className="bg-surface lg:col-span-3 lg:row-span-2">
          <Translate size={22} className="text-accent-ink" />
          <h3 className="mt-4 text-xl font-medium tracking-tight">
            Action-Item Extraction
          </h3>
          <p className="mt-2 max-w-[46ch] text-sm leading-relaxed text-text-muted">
            Every task, owner, deadline, and priority pulled from the meeting and linked
            to the exact moment it was said. No source quote, no ticket.
          </p>
          <div className="mt-6 space-y-2">
            {["Fix the checkout retry bug", "Ship pricing page copy", "Set up staging R2"].map(
              (line, index) => (
                <div
                  key={line}
                  className="flex items-center gap-2.5 rounded-[10px] border border-border bg-surface-2/60 px-3 py-2.5 text-sm"
                >
                  <span className="font-mono text-[10px] text-text-subtle">
                    {`PRE-14${2 + index}`}
                  </span>
                  <span className="text-text-muted">{line}</span>
                </div>
              ),
            )}
          </div>
        </Cell>

        <Cell className="bg-accent-soft lg:col-span-3">
          <Sparkle size={22} className="text-accent-ink" />
          <h3 className="mt-4 text-xl font-medium tracking-tight">
            Auto-Ticketing to Linear
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Approved items become internal tickets and mirrored Linear issues with a
            backlink to the source quote. Two-way sync keeps status honest.
          </p>
        </Cell>

        <Cell className="bg-surface lg:col-span-3">
          <PaperPlaneTilt size={22} className="text-accent-ink" />
          <h3 className="mt-4 text-xl font-medium tracking-tight">
            Automated Follow-Up
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-text-muted">
            Reminders, nudges, and escalation on a schedule you control, delivered by
            email and in-app. Push is not built yet — it needs the service worker the app
            does not have.
          </p>
        </Cell>

        <Cell className="border-transparent bg-ink text-white lg:col-span-3">
          <ChartLineUp size={22} className="text-accent" />
          <h3 className="mt-4 text-xl font-medium tracking-tight">
            Meeting Necessity Score
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Flags the meeting that only discussed a prior meeting, and suggests going
            async instead.
          </p>
        </Cell>

        <Cell className="bg-surface lg:col-span-3">
          <div className="text-accent-ink/40 dot-grid absolute inset-0 opacity-60" aria-hidden />
          <div className="relative">
            <MagicWand size={22} className="text-accent-ink" />
            <h3 className="mt-4 text-xl font-medium tracking-tight">Ask Prepo</h3>
            <p className="mt-2 text-sm leading-relaxed text-text-muted">
              Ask questions across every meeting and ticket and get cited answers that
              open the source line — and the audio moment.
            </p>
          </div>
        </Cell>
      </div>
    </Section>
  );
}
