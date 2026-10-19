import { AskPanel } from "@/components/app/ask-panel";
import { PageHeader } from "@/components/app/page-header";
import { askReadiness } from "@/server/ai/ask";
import { requireWorkspace } from "@/server/context";

/**
 * `/ask` (PREPO.md §8.8). A page rather than only a command-palette trick,
 * because a cited answer needs room to show its passages, and because a feature
 * that only exists inside a keyboard shortcut is not one most people will find.
 *
 * The side panel and the streaming response described in §8.8 are not built; the
 * page says what it reads rather than implying a general assistant.
 */
export default async function AskPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);
  const readiness = askReadiness();

  return (
    <>
      <PageHeader
        title="Ask Prepo"
        description="Answered from this workspace's own transcripts, minutes and tickets, with the passages it used."
      />
      <AskPanel
        workspace={context.slug}
        ready={readiness.ready}
        reason={readiness.reason}
      />
      <p className="mt-8 max-w-[80ch] text-xs leading-relaxed text-text-subtle">
        Retrieval is full-text over transcript lines, plus this workspace&rsquo;s
        meetings and tickets. Answers are not streamed, nothing here writes to the
        workspace, and a citation opens the meeting&rsquo;s transcript tab rather
        than jumping to the exact line.
      </p>
    </>
  );
}
