import { cn } from "@/lib/utils";

/**
 * The workspace segment's instant loading state. The [workspace] layout
 * resolves the session, the workspace and the shell counts before anything
 * below renders, and the Next.js file-convention docs note that a layout
 * which reads runtime data blocks its own fallback, so this skeleton is not
 * about the auth path. It covers the part a member actually waits on: the
 * page's own queries against Postgres.
 *
 * The blocks are grey and still: MOTION is dial 1, and the only motion it
 * allows is hover and focus feedback, so a pulsing skeleton is not part of
 * this design. The shapes repeat the surfaces the real page is about to
 * draw, a header line and a summary strip and rows, so the swap-in reads as
 * progress rather than as a layout change.
 */

function Bar({ className }: { className: string }) {
  return <div className={cn("rounded-1 bg-surface-2", className)} />;
}

export default function Loading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Bar className="h-6 w-44" />
          <Bar className="mt-2 h-4 w-72" />
        </div>
        <Bar className="h-10 w-32 rounded-2" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Bar className="h-16 rounded-3" />
        <Bar className="h-16 rounded-3" />
        <Bar className="h-16 rounded-3" />
      </div>
      <div className="rounded-3 border border-border bg-surface">
        <div className="space-y-4 p-5">
          <Bar className="h-4 w-40" />
          {/* Row rhythm a table/list is about to take over; the last row is
              shorter so the skeleton does not promise a full-width edge. */}
          {[0, 1, 2, 3].map((row) => (
            <Bar
              key={row}
              className={cn(
                "h-5",
                ["w-full", "w-full", "max-w-[80%]", "max-w-[55%]"][row],
              )}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
