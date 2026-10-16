import { ArrowRight } from "@phosphor-icons/react/dist/ssr";
import { Dashboard } from "@/components/app/dashboard";
import { PageHeader } from "@/components/app/page-header";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function WorkspaceDashboardPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="What needs you today, and what the agent is chasing."
        actions={
          <a
            href={`/${workspace}/meetings/new`}
            className={cn(buttonVariants({ size: "sm" }))}
          >
            New meeting
            <ArrowRight size={14} weight="bold" />
          </a>
        }
      />
      <Dashboard workspace={workspace} />
    </>
  );
}
