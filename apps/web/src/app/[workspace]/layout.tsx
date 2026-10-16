import { AppShell } from "@/components/app/app-shell";
import { requireWorkspace } from "@/server/context";
import { listActionItemsView } from "@/server/queries";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  // Unknown slugs 404 here rather than rendering a shell over empty data.
  const context = await requireWorkspace(workspace);
  const actionItems = await listActionItemsView(context.id);
  const reviewCount = actionItems.filter(
    (item) => item.status === "proposed",
  ).length;

  return (
    <AppShell
      workspace={context.slug}
      workspaceName={context.name}
      viewerName={context.viewer.name}
      viewerEmail={context.viewer.email}
      reviewCount={reviewCount}
    >
      {children}
    </AppShell>
  );
}
