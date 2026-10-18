import { TicketDetail } from "@/components/app/ticket-detail";
import { EmptyState } from "@/components/app/page-header";
import { requireWorkspace } from "@/server/context";
import { integrationSummary } from "@/server/linear/sync";
import {
  getMeetingView,
  getTicketView,
  listTicketComments,
  listTicketEvents,
  listTicketFollowups,
} from "@/server/queries";

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ workspace: string; key: string }>;
}) {
  const { workspace, key } = await params;
  const context = await requireWorkspace(workspace);
  const ticket = await getTicketView(context.id, key);

  if (!ticket) {
    return (
      <EmptyState
        title={`Ticket ${key} not found`}
        description="It may have been deleted, or the link is out of date."
        action={
          <a
            href={`/${context.slug}/tickets`}
            className="text-sm text-accent-ink hover:underline"
          >
            Back to tickets
          </a>
        }
      />
    );
  }

  const [meeting, comments, events, followups, linear] = await Promise.all([
    ticket.meetingId ? getMeetingView(context.id, ticket.meetingId) : null,
    listTicketComments(context.id, ticket.id),
    listTicketEvents(context.id, ticket.id),
    listTicketFollowups(context.id, ticket.id),
    // Only used to decide whether the Linear card belongs on the page at all.
    integrationSummary(context.id),
  ]);

  return (
    <TicketDetail
      workspace={context.slug}
      ticket={ticket}
      meeting={meeting}
      comments={comments}
      events={events}
      followups={followups}
      viewerName={context.viewer.name}
      linearConnected={linear.connected}
    />
  );
}
