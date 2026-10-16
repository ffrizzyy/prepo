import { MeetingsTable } from "@/components/app/meetings-table";
import { PageHeader } from "@/components/app/page-header";

export default async function MeetingsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <>
      <PageHeader
        title="Meetings"
        description="Every meeting Prepo has read, and what came out of it."
      />
      <MeetingsTable workspace={workspace} />
    </>
  );
}
