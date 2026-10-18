"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkle } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ExtractionReport } from "@/server/ai/extract";
import { extractMeetingNow } from "@/server/actions";

/**
 * The button that spends a model call. It reports exactly what the server did:
 * how many items survived grounding, how many were dropped, and whether the
 * autonomy setting ticketed any of them without a person. A refused run shows
 * the server's reason rather than a generic failure.
 */
function describe(report: ExtractionReport): string {
  if (report.status === "extracted") {
    const items = report.items ?? 0;
    const parts = [`Extracted ${items} action item${items === 1 ? "" : "s"}`];
    if (report.autoApproved) {
      parts.push(`${report.autoApproved} approved automatically`);
    }
    if (report.dropped) {
      parts.push(`${report.dropped} dropped for no usable citation or an empty title`);
    }
    const text = `${parts.join(", ")}.`;
    return report.warning ? `${text} ${report.warning}` : text;
  }

  if (report.status === "already") {
    return "This meeting already has minutes or action items.";
  }

  return report.reason ?? "Extraction did not import anything.";
}

export function ExtractButton({
  workspace,
  meetingId,
  hasSummary,
}: {
  workspace: string;
  meetingId: string;
  hasSummary: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [report, setReport] = useState<ExtractionReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setPending(true);
    setError(null);
    try {
      const result = await extractMeetingNow({ workspace, meetingId });
      setReport(result);
      // The summary and the review queue are server-rendered.
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Extraction failed.");
    } finally {
      setPending(false);
    }
  }

  const refused =
    report !== null && report.status !== "extracted" && report.status !== "already";

  return (
    <div className="mt-4">
      <Button
        type="button"
        variant={hasSummary ? "outline" : "primary"}
        size="sm"
        onClick={() => void run()}
        disabled={pending}
      >
        <Sparkle size={14} weight="fill" aria-hidden />
        {pending
          ? "Reading the transcript…"
          : hasSummary
            ? "Extract again"
            : "Extract minutes and actions"}
      </Button>

      {report ? (
        <div className="mt-3 space-y-1">
          <p
            className={cn(
              "text-xs leading-relaxed",
              refused ? "text-[#b91c1c] dark:text-[#f87171]" : "text-text-muted",
            )}
          >
            {describe(report)}
          </p>
          {report.status === "extracted" ? (
            <p className="font-mono text-[10px] text-text-subtle">
              {report.model}
              {report.costUsd ? ` · $${report.costUsd}` : ""}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 text-xs text-[#b91c1c] dark:text-[#f87171]">{error}</p>
      ) : null}

      <p className="mt-3 text-xs leading-relaxed text-text-subtle">
        One model call over this transcript. Nothing is ticketed until someone approves it,
        unless the workspace autonomy level says otherwise.
      </p>
    </div>
  );
}
