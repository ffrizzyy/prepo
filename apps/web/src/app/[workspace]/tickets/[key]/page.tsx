import { TicketDetail } from "@/components/app/ticket-detail";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; key: string }>;
}) {
  const { workspace, key } = await params;
  return <TicketDetail workspace={workspace} ticketKey={key} />;
}
