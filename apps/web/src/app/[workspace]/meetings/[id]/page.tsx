import { MeetingDetail } from "@/components/app/meeting-detail";
import { EmptyState } from "@/components/app/page-header";
import { requireWorkspace } from "@/server/context";
import {
  getMeetingView,
  listActionItemsView,
  listSegmentsView,
} from "@/server/queries";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace, id } = await params;
  const context = await requireWorkspace(workspace);

  const meeting = await getMeetingView(context.id, id);
  if (!meeting) {
    return (
      <EmptyState
        title="Meeting not found"
        description="It may have been deleted, along with everything derived from it."
        action={
          <a
            href={`/${context.slug}/meetings`}
            className="text-sm text-accent-ink hover:underline"
          >
            Back to meetings
          </a>
        }
      />
    );
  }

  const [segments, actionItems] = await Promise.all([
    listSegmentsView(context.id, meeting.id),
    listActionItemsView(context.id, meeting.id),
  ]);

  return (
    <MeetingDetail
      workspace={context.slug}
      meeting={meeting}
      segments={segments}
      actionItems={actionItems}
    />
  );
}
