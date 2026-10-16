import { MeetingDetail } from "@/components/app/meeting-detail";

export default async function MeetingDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; id: string }>;
}) {
  const { workspace, id } = await params;
  return <MeetingDetail workspace={workspace} meetingId={id} />;
}
