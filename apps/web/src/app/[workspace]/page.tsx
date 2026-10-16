import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Dashboard } from "@/components/app/dashboard";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { requireWorkspace } from "@/server/context";
import {
  listActionItemsView,
  listFollowupsView,
  listMeetingsView,
  listTicketsView,
} from "@/server/queries";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);

  const [tickets, meetings, actionItems, followups] = await Promise.all([
    listTicketsView(context.id),
    listMeetingsView(context.id),
    listActionItemsView(context.id),
    listFollowupsView(context.id),
  ]);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs you today, and what the agent is chasing."
        actions={
          <a
            href={`/${context.slug}/meetings/new`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            New meeting
            <ArrowRight size={14} weight="bold" />
          </a>
        }
      />
      <Dashboard
        workspace={context.slug}
        tickets={tickets}
        meetings={meetings}
        actionItems={actionItems}
        followups={followups}
      />
    </>
  );
}
