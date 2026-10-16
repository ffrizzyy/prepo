import { Board } from "@/components/app/board";
import { PageHeader } from "@/components/app/page-header";
import { requireWorkspace } from "@/server/context";
import { listTicketsView } from "@/server/queries";

export default async function BoardPage({
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
        title="Board"
        description="Drag a ticket between columns, or use the menu on each card."
      />
      <Board workspace={context.slug} tickets={tickets} />
    </>
  );
}
