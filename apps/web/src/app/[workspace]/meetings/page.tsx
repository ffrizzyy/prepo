import { MeetingsTable } from "@/components/app/meetings-table";
import { PageHeader } from "@/components/app/page-header";
import { requireWorkspace } from "@/server/context";
import { listMeetingsView } from "@/server/queries";

export default async function MeetingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);
  const meetings = await listMeetingsView(context.id);

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Every meeting Prepo has read, and what came out of it."
      />
      <MeetingsTable workspace={context.slug} meetings={meetings} />
    </>
  );
}
