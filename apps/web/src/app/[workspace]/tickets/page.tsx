import { PageHeader } from "@/components/app/page-header";
import { TicketsTable } from "@/components/app/tickets-table";
import { requireWorkspace } from "@/server/context";
import { listTicketsView } from "@/server/queries";

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);
  const tickets = await listTicketsView(context.id);

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Everything the agent has created, and where it stands."
      />
      <TicketsTable workspace={context.slug} tickets={tickets} />
    </>
  );
}
