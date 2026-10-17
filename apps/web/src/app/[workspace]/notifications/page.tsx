import { Bell } from "@phosphor-icons/react/dist/ssr";
import { Card, EmptyState, PageHeader } from "@/components/app/page-header";
import { MarkAllRead, MarkRead } from "@/components/app/followup-controls";
import { requireWorkspace } from "@/server/context";
import { listNotifications } from "@/server/queries";
import { formatShortDate } from "@/lib/workspace-data";

/**
 * The notification centre, per person (PREPO.md §8.11.2). A reminder about your
 * own work lands here; so does the weekly digest. Nothing here is a copy of an
 * email that pretends to have been read.
 */
export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);
  const notifications = await listNotifications(
    context.id,
    context.viewer.userId,
  );

  const unread = notifications.filter((entry) => entry.readAt === null).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        description="What the agent sent you, newest first."
        actions={<MarkAllRead workspace={context.slug} unread={unread} />}
      />

      {notifications.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          description="Reminders about work assigned to you, and the weekly digest, arrive here."
          action={
            <a
              href={`/${context.slug}/followups`}
              className="text-sm text-accent-ink hover:underline"
            >
              See what is scheduled
            </a>
          }
        />
      ) : (
        <Card title={`Inbox (${notifications.length})`}>
          <ul className="divide-y divide-border">
            {notifications.map((entry) => (
              <li
                key={entry.id}
                className="flex items-start gap-3 py-3 first:pt-0"
              >
                <Bell
                  size={16}
                  className={
                    entry.readAt === null
                      ? "mt-0.5 shrink-0 text-accent-ink"
                      : "mt-0.5 shrink-0 text-text-subtle"
                  }
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={
                      entry.readAt === null
                        ? "text-sm font-medium"
                        : "text-sm text-text-muted"
                    }
                  >
                    {entry.title}
                  </p>
                  {entry.body ? (
                    <p className="mt-1 text-xs text-text-muted">{entry.body}</p>
                  ) : null}
                  <p className="mt-1 font-mono text-[10px] text-text-subtle">
                    {entry.type} · {formatShortDate(entry.createdAt)}
                    {entry.href ? (
                      <>
                        {" · "}
                        <a
                          href={entry.href}
                          className="text-accent-ink hover:underline"
                        >
                          Open
                        </a>
                      </>
                    ) : null}
                  </p>
                </div>
                {entry.readAt === null ? (
                  <MarkRead
                    workspace={context.slug}
                    notificationId={entry.id}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
  );
}
