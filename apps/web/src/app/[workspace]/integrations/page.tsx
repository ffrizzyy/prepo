import { ArrowSquareOut, Plugs, Warning } from "@phosphor-icons/react/dist/ssr";
import { Card, PageHeader } from "@/components/app/page-header";
import {
  LinearConnect,
  LinearDisconnect,
  LinearMappingEditor,
  LinearSourceOfTruthControl,
  LinearSyncNow,
  LinearTeamPicker,
  LinearWebhookSecretControl,
} from "@/components/app/integration-controls";
import { requireWorkspace } from "@/server/context";
import {
  availableProjects,
  availableTeams,
  integrationSummary,
} from "@/server/linear/sync";
import { linearQueueSummary } from "@/server/queries";
import { relativeTime } from "@/lib/workspace-data";

/**
 * Integrations (PREPO.md §8.6). The page's job is to say what is true right
 * now: whether a token is stored, whether this deployment can even encrypt one,
 * what the job would do next, and what is deliberately not synced.
 */

const WEBHOOK_PATH = "/api/integrations/linear/webhook";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-2 last:border-b-0">
      <span className="text-xs text-text-subtle">{label}</span>
      <span className="text-sm">{children}</span>
    </div>
  );
}

function Notice({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
      <Warning size={16} className="mt-0.5 shrink-0 text-accent-ink" aria-hidden />
      <p className="max-w-[70ch] text-xs leading-relaxed text-text-muted">
        {children}
      </p>
    </div>
  );
}

export default async function IntegrationsPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  const context = await requireWorkspace(workspace);

  // Changing the connection is owner/admin-only on the server, so the page does
  // not offer a button that would only throw. Everything stays readable.
  const canManage =
    context.viewer.role === "owner" || context.viewer.role === "admin";

  const summary = await integrationSummary(context.id);

  const teams = summary.usable ? await availableTeams(context.id) : null;
  const projects =
    summary.usable && summary.teamId
      ? await availableProjects(context.id, summary.teamId)
      : null;

  const queue = summary.connected ? await linearQueueSummary(context.id) : null;

  const appUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? null;
  const webhookUrl = `${appUrl ?? ""}${WEBHOOK_PATH}`;

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Linear two-way sync: a ticket and its issue, kept in step by a job. Changing a ticket queues it; nothing is sent from the request that moves it."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {!summary.connected ? (
            <Card
              title="Connect Linear"
              action={<Plugs size={16} className="text-text-subtle" aria-hidden />}
            >
              <div className="space-y-4">
                {summary.status === "disconnected" ? (
                  <Notice>
                    This workspace was connected before and was disconnected. The
                    token was removed; the tickets and the issues are still there.
                    Connecting again starts from a clean token.
                  </Notice>
                ) : null}
                {canManage ? (
                  <LinearConnect
                    workspace={workspace}
                    canStore={summary.encryptionReady}
                  />
                ) : (
                  <Notice>
                    Only an owner or an admin can connect Linear or change this
                    page. Nothing is connected right now, so every ticket stays
                    in Prepo.
                  </Notice>
                )}
                <p className="max-w-[65ch] text-xs leading-relaxed text-text-subtle">
                  Connecting is what turns the queue on: until a token is stored,
                  a board move or an approved action item changes Prepo and
                  touches nothing else. Nothing is written to Linear during
                  sign-in — issues are only ever created by a push.
                </p>
              </div>
            </Card>
          ) : (
            <>
              <Card title="Connection">
                <div className="space-y-3">
                  <div>
                    <Row label="Status">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-1.5 w-1.5 rounded-full bg-[#15803d] dark:bg-[#4ade80]"
                          aria-hidden
                        />
                        Connected
                      </span>
                    </Row>
                    <Row label="Team">
                      {summary.teamId ? (
                        <span className="font-mono text-xs">
                          {summary.teamId}
                        </span>
                      ) : (
                        <span className="text-accent-ink">Not chosen yet</span>
                      )}
                    </Row>
                    <Row label="Project">
                      {summary.projectId ? (
                        <span className="font-mono text-xs">
                          {summary.projectId}
                        </span>
                      ) : (
                        <span className="text-text-subtle">None</span>
                      )}
                    </Row>
                    <Row label="Last sync">
                      {summary.lastSyncedAt ? (
                        relativeTime(summary.lastSyncedAt.toISOString())
                      ) : (
                        <span className="text-text-subtle">Never</span>
                      )}
                    </Row>
                    <Row label="Tickets linked">
                      <span className="font-mono text-xs">
                        {queue?.linked ?? 0}
                      </span>
                    </Row>
                    <Row label="Waiting to send">
                      <span className="font-mono text-xs">
                        {queue?.pending ?? 0}
                      </span>
                    </Row>
                    <Row label="Refused, retrying">
                      <span className="font-mono text-xs">
                        {queue?.failed ?? 0}
                      </span>
                    </Row>
                  </div>

                  {summary.lastError ? (
                    <Notice>{summary.lastError}</Notice>
                  ) : null}

                  {!summary.usable ? (
                    <Notice>
                      The stored token cannot be used: {summary.blockedReason}.
                      Nothing will be sent until that is resolved.
                    </Notice>
                  ) : null}

                  {summary.encryptionReady ? null : (
                    <Notice>
                      <code className="rounded bg-surface px-1 py-0.5 text-xs">
                        INTEGRATION_ENCRYPTION_KEY
                      </code>{" "}
                      is not set on this deployment, so the stored token cannot
                      be decrypted and nothing can be sent.
                    </Notice>
                  )}

                  {canManage ? (
                    <LinearSyncNow workspace={workspace} />
                  ) : (
                    <Notice>
                      Only an owner or an admin can run a sync from here. The
                      scheduled job still runs.
                    </Notice>
                  )}

                  <p className="max-w-[65ch] text-xs leading-relaxed text-text-subtle">
                    Scheduled runs come from{" "}
                    <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                      pnpm --filter @prepo/web db:linear
                    </code>
                    . Sync now calls the same function in this request, so a
                    button press proves what the schedule would do.
                  </p>
                </div>
              </Card>

              {queue && queue.failed > 0 ? (
                <Card title="Refused tickets">
                  <p className="max-w-[65ch] text-sm leading-relaxed text-text-muted">
                    {queue.failed} ticket{queue.failed === 1 ? " has" : "s have"}{" "}
                    been refused by Linear and are waiting out a backoff. Each one
                    says why on its own page, and each one can be queued again
                    from there.
                  </p>
                </Card>
              ) : null}

              <Card title="Team issues are filed into">
                {!canManage ? (
                  <Notice>
                    Only an owner or an admin can change the team. It is{" "}
                    <span className="font-mono text-[11px]">
                      {summary.teamId ?? "not chosen"}
                    </span>
                    .
                  </Notice>
                ) : teams && teams.ok ? (
                  <LinearTeamPicker
                    workspace={workspace}
                    teams={teams.teams}
                    projects={projects && projects.ok ? projects.projects : []}
                    teamId={summary.teamId}
                    projectId={summary.projectId}
                  />
                ) : (
                  <Notice>
                    The teams could not be listed:{" "}
                    {teams && !teams.ok ? teams.reason : summary.blockedReason}.
                  </Notice>
                )}
              </Card>
            </>
          )}
        </div>

        <div className="space-y-6">
          {summary.connected ? (
            <>
              <Card title="Mapping table">
                {canManage ? (
                  <LinearMappingEditor
                    workspace={workspace}
                    mapping={summary.mapping}
                  />
                ) : (
                  <Notice>
                    Only an owner or an admin can see or change the mapping.
                  </Notice>
                )}
              </Card>

              <Card title="When both sides changed">
                {canManage ? (
                  <LinearSourceOfTruthControl
                    workspace={workspace}
                    value={summary.sourceOfTruth}
                  />
                ) : (
                  <Notice>
                    Only an owner or an admin can change which side wins.{" "}
                    {summary.sourceOfTruth === "linear"
                      ? "Linear is currently final."
                      : "Prepo is currently final."}
                  </Notice>
                )}
              </Card>

              <Card title="Webhook">
                <div className="space-y-3">
                  <p className="text-xs leading-relaxed text-text-subtle">
                    Point a Linear webhook at this address and select Issue
                    events. Linear needs the full address, so this is what to
                    paste:
                  </p>
                  <p className="break-all rounded-[10px] border border-border bg-surface-2 px-2.5 py-2 font-mono text-xs">
                    {webhookUrl}
                  </p>
                  {appUrl ? null : (
                    <p className="text-xs leading-relaxed text-text-subtle">
                      This deployment has no{" "}
                      <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                        APP_URL
                      </code>{" "}
                      set, so only the path is shown. Prefix it with this
                      deployment&apos;s origin.
                    </p>
                  )}
                  {canManage ? (
                    <LinearWebhookSecretControl
                      workspace={workspace}
                      hasSecret={summary.hasWebhookSecret}
                    />
                  ) : (
                    <p className="text-xs leading-relaxed text-text-subtle">
                      {summary.hasWebhookSecret
                        ? "A signing secret is stored, so deliveries are verified."
                        : "No signing secret is stored, so deliveries are refused until an owner or an admin sets one."}
                    </p>
                  )}
                  <p className="max-w-[65ch] text-xs leading-relaxed text-text-subtle">
                    A webhook is a shortcut, not a requirement: without one, the
                    scheduled job still pulls the same changes. Deliveries are
                    signed with HMAC-SHA256 and a delivery older than a minute is
                    refused, so a captured request cannot be replayed later.
                  </p>
                </div>
              </Card>
            </>
          ) : null}

          <Card title="What is not synced">
            <ul className="max-w-[65ch] space-y-2 text-xs leading-relaxed text-text-muted">
              <li>
                Comments and attachments. Prepo&apos;s ticket discussion stays in
                Prepo; Linear&apos;s stays in Linear.
              </li>
              <li>
                A Linear issue moved to <em>Cancelled</em> does not finish or
                reopen the ticket: Prepo has no cancelled status, so the ticket is
                left where it is and the state is reported as unmapped.
              </li>
              <li>
                Exactly one team and one project are mirrored per workspace. A
                ticket has no issue outside that team.
              </li>
              <li>
                Issues are only created by a push. A ticket created in Linear is
                pulled in only if Prepo is already mirroring it.
              </li>
              <li>
                Sub-issues, cycles, estimates and Linear&apos;s own labels are
                neither read nor written.
              </li>
            </ul>
          </Card>

          {summary.connected ? (
            <Card title="Disconnecting">
              {canManage ? (
                <LinearDisconnect workspace={workspace} />
              ) : (
                <p className="text-xs leading-relaxed text-text-subtle">
                  Only an owner or an admin can disconnect. The connection stays
                  as it is, and tickets keep syncing.
                </p>
              )}
            </Card>
          ) : null}

          {!summary.connected ? (
            <Card title="What connecting does">
              <ul className="max-w-[65ch] space-y-2 text-xs leading-relaxed text-text-muted">
                <li>
                  Stores the token encrypted with AES-256-GCM. Without{" "}
                  <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                    INTEGRATION_ENCRYPTION_KEY
                  </code>{" "}
                  the token is refused rather than stored in the clear.
                </li>
                <li>
                  Maps priority, status, labels and owners onto Linear. The table
                  is editable once connected.
                </li>
                <li>
                  Queues tickets as they are approved or moved, then sends them in
                  the next job run.
                </li>
                <li>
                  That run is{" "}
                  <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
                    pnpm --filter @prepo/web db:linear
                  </code>
                  , for a scheduler — or the Sync now button on this page once
                  the connection exists.
                </li>
                <li>
                  Shows the synced issue on the ticket, with a retry when Linear
                  refuses.
                </li>
              </ul>
              <a
                href="https://linear.app/settings/api"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-ink hover:underline"
              >
                Linear API settings
                <ArrowSquareOut size={12} weight="bold" />
              </a>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
