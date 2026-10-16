import { AppShell } from "@/components/app/app-shell";
import { WorkspaceStoreProvider } from "@/components/app/store";
import { getActionItems, getTickets } from "@/lib/workspace-data";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const actionItems = getActionItems();
  const reviewCount = actionItems.filter((item) => item.status === "proposed").length;

  return (
    <WorkspaceStoreProvider
      initialTickets={getTickets()}
      initialActionItems={actionItems}
    >
      <AppShell workspace={workspace} reviewCount={reviewCount}>
        {children}
      </AppShell>
    </WorkspaceStoreProvider>
  );
}
