import { NewMeeting } from "@/components/app/new-meeting";
import { PageHeader } from "@/components/app/page-header";

/**
 * The form posts to route handlers and comes back here with the reason in the
 * query string, which is what lets the whole page work without JavaScript.
 */
export default async function NewMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { workspace } = await params;
  const { notice, error } = await searchParams;

  return (
    <>
      <PageHeader
        title="New meeting"
        description="Record, upload, or paste, Prepo handles the rest."
      />
      <NewMeeting workspace={workspace} notice={notice} error={error} />
    </>
  );
}
