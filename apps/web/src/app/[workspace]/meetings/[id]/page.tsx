import {
  MeetingDetail,
  type MeetingTab,
} from "@/components/app/meeting-detail";
import { EmptyState } from "@/components/app/page-header";
import { extractionReadiness } from "@/server/ai/extract";
import { retentionLabel } from "@/server/audio/retention";
import { requireWorkspace } from "@/server/context";
import {
  getMeetingAudio,
  getMeetingView,
  listActionItemsView,
  listSegmentsView,
  listSpeakerLabels,
} from "@/server/queries";
import { meetingDeletionImpact } from "@/server/writes";

const TABS: Record<string, MeetingTab> = {
  summary: "Summary",
  actions: "Actions",
  transcript: "Transcript",
  activity: "Activity",
};

export default async function MeetingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; id: string }>;
  searchParams: Promise<{ tab?: string; notice?: string }>;
}) {
  const { workspace, id } = await params;
  const { tab, notice } = await searchParams;
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

  const [segments, actionItems, audio, speakers, impact] = await Promise.all([
    listSegmentsView(context.id, id),
    listActionItemsView(context.id),
    getMeetingAudio(context.id, id),
    listSpeakerLabels(context.id, id),
    meetingDeletionImpact({ workspaceId: context.id, meetingId: id }),
  ]);

  return (
    <MeetingDetail
      workspace={context.slug}
      meeting={meeting}
      segments={segments}
      actionItems={actionItems}
      audio={audio}
      speakers={speakers}
      members={context.members.map((member) => ({
        userId: member.userId,
        name: member.name,
      }))}
      initialTab={tab ? (TABS[tab] ?? "Summary") : "Summary"}
      notice={notice}
      retention={`${retentionLabel(context.settings.audioRetentionDays)}.`}
      extraction={extractionReadiness()}
      canExtract={context.viewer.role !== "viewer"}
      impact={impact}
      canDelete={context.viewer.role === "owner" || context.viewer.role === "admin"}
    />
  );
}
