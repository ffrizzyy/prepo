import { Board } from "@/components/app/board";
import { PageHeader } from "@/components/app/page-header";

export default async function BoardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <>
      <PageHeader
        title="Board"
        description="Drag a ticket between columns, or use the menu on each card."
      />
      <Board workspace={workspace} />
    </>
  );
}
