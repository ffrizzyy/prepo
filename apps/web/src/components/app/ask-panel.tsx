"use client";

import { useState } from "react";
import { ArrowElbowDownLeft } from "@phosphor-icons/react";
import type { AskReport, AskSource } from "@/server/ai/ask";
import { askPrepo } from "@/server/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Ask Prepo, on the page (§8.8). Two things shape it:
 *
 * - The question box is the whole interface. No chat bubbles, no avatar, and no
 *   fake typing indicator: it is a search box with a model behind it, and saying
 *   that plainly is more honest than dressing it as a conversation.
 * - The answer never appears without its passages. Each source is a real row
 *   (the transcript words, the speaker, the meeting), so a reader can check the
 *   claim instead of trusting the voice it was written in. When there is no
 *   citation, the panel says so in the same place the citations would be.
 */

const EXAMPLES = [
  "What did we decide about the Q4 launch?",
  "Which tickets are overdue?",
  "What is still open from the last meeting?",
] as const;

function at(startMs: number | null): string {
  if (startMs === null) return "";
  const total = Math.round(startMs / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function sourceHref(workspace: string, source: AskSource): string | null {
  if (source.kind === "transcript" && source.meetingId) {
    return `/${workspace}/meetings/${source.meetingId}?tab=transcript`;
  }
  if (source.kind === "meeting" && source.meetingId) {
    return `/${workspace}/meetings/${source.meetingId}`;
  }
  if (source.kind === "ticket" && source.ticketKey) {
    return `/${workspace}/tickets/${source.ticketKey}`;
  }
  return null;
}

export function AskPanel({
  workspace,
  ready,
  reason,
}: {
  workspace: string;
  ready: boolean;
  /** Why it cannot answer, when it cannot. */
  reason: string | null;
}) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<AskReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0 || pending) return;

    setPending(true);
    setError(null);
    try {
      setReport(await askPrepo({ workspace, question: trimmed }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That question did not run.");
    } finally {
      setPending(false);
    }
  }

  const answered = report?.status === "answered";

  return (
    <div className="max-w-[80ch]">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit(question);
        }}
      >
        <label htmlFor="ask-question" className="text-sm font-medium">
          Your question
        </label>
        <textarea
          id="ask-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          onKeyDown={(event) => {
            // Enter asks; Shift+Enter is a new line. A one-line box would hide
            // the cap, and the cap is real.
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit(question);
            }
          }}
          rows={2}
          maxLength={500}
          disabled={!ready || pending}
          placeholder="Ask about a decision, a ticket, or what happened in a meeting."
          className="mt-1.5 w-full resize-y rounded-2 border border-border bg-surface px-3 py-2 text-sm leading-relaxed placeholder:text-text-subtle disabled:opacity-60"
        />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!ready || pending || question.trim().length === 0}
          >
            <ArrowElbowDownLeft size={14} aria-hidden />
            {pending ? "Reading the workspace…" : "Ask"}
          </Button>
          <span className="text-xs text-text-subtle">
            {question.length}/500 characters
          </span>
        </div>
      </form>

      {!ready ? (
        <p className="mt-4 rounded-3 border border-border bg-surface p-4 text-sm leading-relaxed text-text-muted">
          {reason ?? "Ask Prepo is not configured on this deployment."}
        </p>
      ) : null}

      {report === null && ready ? (
        <div className="mt-6">
          <p className="text-xs font-medium text-text-subtle">Try one of these</p>
          <ul className="mt-2 space-y-1">
            {EXAMPLES.map((example) => (
              <li key={example}>
                <button
                  type="button"
                  onClick={() => {
                    setQuestion(example);
                    void submit(example);
                  }}
                  className="text-left text-sm text-accent-ink hover:underline"
                >
                  {example}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report && !answered ? (
        <p
          className={cn(
            "mt-4 rounded-3 border border-border bg-surface p-4 text-sm leading-relaxed",
            report.status === "failed" || report.status === "invalid"
              ? "text-danger"
              : "text-text-muted",
          )}
        >
          {report.reason ?? "That question did not produce an answer."}
        </p>
      ) : null}

      {report && answered ? (
        <section className="mt-6" aria-live="polite">
          {report.confident === false ? (
            <p className="mb-3 rounded-3 border border-border bg-surface p-3 text-xs leading-relaxed text-text-muted">
              The passages this workspace holds do not answer that question. What
              follows is what they do say.
            </p>
          ) : null}

          <h2 className="text-xs font-medium text-text-subtle">Answer</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
            {report.answer}
          </p>

          {report.uncited ? (
            <p className="mt-3 text-xs leading-relaxed text-danger">
              No passage was cited for this answer, so there is nothing here to
              check it against.
            </p>
          ) : null}

          {report.sources && report.sources.length > 0 ? (
            <div className="mt-5">
              <h2 className="text-xs font-medium text-text-subtle">
                What this is based on
              </h2>
              <ol className="mt-2 space-y-3">
                {report.sources.map((source, index) => {
                  const href = sourceHref(workspace, source);
                  const label = `${source.label}${
                    source.startMs === null ? "" : ` at ${at(source.startMs)}`
                  }`;
                  return (
                    <li
                      key={`${source.kind}-${source.segmentId ?? source.ticketKey ?? source.meetingId ?? index}`}
                      className="border-l-2 border-border pl-3"
                    >
                      {source.quote ? (
                        <p className="text-sm leading-relaxed text-text">
                          &ldquo;{source.quote}&rdquo;
                        </p>
                      ) : null}
                      {href ? (
                        <a
                          href={href}
                          className="mt-1 inline-block text-xs text-accent-ink hover:underline"
                        >
                          {label}
                        </a>
                      ) : (
                        <span className="mt-1 inline-block text-xs text-text-subtle">
                          {label}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ol>
            </div>
          ) : null}

          <p className="mt-5 text-[11px] text-text-subtle">
            {report.passageCount ?? 0} passages read
            {report.model ? ` · ${report.model}` : ""}
            {report.costUsd ? ` · $${report.costUsd}` : ""}
            {report.droppedCitations
              ? ` · ${report.droppedCitations} citation${report.droppedCitations === 1 ? "" : "s"} named a passage that was never sent, so it was dropped`
              : ""}
          </p>
        </section>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
