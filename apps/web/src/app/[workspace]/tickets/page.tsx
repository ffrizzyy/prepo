import { PageHeader } from "@/components/app/page-header";
import { TicketsTable } from "@/components/app/tickets-table";

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <>
      <PageHeader
        title="Tickets"
        description="Everything the agent has created, and where it stands."
      />
      <TicketsTable workspace={workspace} />
    </>
  );
}
