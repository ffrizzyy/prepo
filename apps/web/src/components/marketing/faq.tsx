import { Plus } from "@phosphor-icons/react/dist/ssr";
import { Section } from "@/components/ui/section";

const QUESTIONS = [
  {
    q: "Is my data used to train AI models?",
    a: "No. Meeting content is sent to the configured model only to produce your tickets and summaries. It is never used for training, and it is never mixed across workspaces.",
  },
  {
    q: "How is audio handled and deleted?",
    a: "Audio lands in a private bucket and is transcribed. By default it is deleted 30 days after transcription, and you can set it to delete immediately. Transcripts stay until the meeting is deleted.",
  },
  {
    q: "Which tools does it connect to?",
    a: "Linear is a live, two-way integration. Zoom, Google Meet, and Microsoft Teams are supported by importing their transcripts or recordings. Slack, WhatsApp, and Jira are intentionally out of scope.",
  },
  {
    q: "What can the AI do without approval?",
    a: "It depends on the workspace autonomy level. Suggest requires approval for everything; Assist auto-tickets only high-confidence items with an owner and a date; Autopilot also follows up. Every action is logged and reversible.",
  },
  {
    q: "Can I self-host it?",
    a: "You can run it on your own machine today: PGlite means no database to install, and docker-compose.yml is there if you want a real Postgres instead. Deploying it to a host is not something this repository has done or tested.",
  },
  {
    q: "Does it work offline?",
    a: "No. Offline reads and queued edits need a service worker, and Prepo does not ship one — the same missing piece is why push is not offered.",
  },
  {
    q: "Do I need an account to try it?",
    a: "No. The demo workspace is seeded with a realistic meeting and opens without a signup. Sign in only when you want to bring your own meetings.",
  },
];

export function Faq() {
  return (
    <Section className="border-t border-border">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,0.4fr)_minmax(0,0.6fr)]">
        <h2 className="text-3xl leading-tight tracking-tighter md:text-4xl">
          Questions, answered plainly
        </h2>

        <div className="divide-y divide-border border-y border-border">
          {QUESTIONS.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-medium">
                {item.q}
                <Plus
                  size={16}
                  weight="bold"
                  className="shrink-0 text-text-subtle transition-transform group-open:rotate-45"
                  aria-hidden
                />
              </summary>
              <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-text-muted">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </Section>
  );
}
