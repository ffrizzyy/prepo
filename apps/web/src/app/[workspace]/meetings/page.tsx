import { MeetingsTable } from "@/components/app/meetings-table";
import { PageHeader } from "@/components/app/page-header";
import { requireWorkspace } from "@/server/context";
import { listMeetingsView } from "@/server/queries";

export default async function MeetingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { workspace } = await params;
  const { notice } = await searchParams;
  const context = await requireWorkspace(workspace);
  const meetings = await listMeetingsView(context.id);

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Every meeting Prepo has read, and what came out of it."
      />
      {notice ? (
        <p className="mb-6 max-w-[80ch] rounded-3 border border-border bg-surface p-4 text-sm text-text-muted">
          {notice}
        </p>
      ) : null}
      <MeetingsTable workspace={context.slug} meetings={meetings} />
    </>
  );
}
