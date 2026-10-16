import { NewMeeting } from "@/components/app/new-meeting";
import { PageHeader } from "@/components/app/page-header";

export default async function NewMeetingPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <>
      <PageHeader
        title="New meeting"
        description="Record, upload, or paste — Prepo handles the rest."
      />
      <NewMeeting workspace={workspace} />
    </>
  );
}
