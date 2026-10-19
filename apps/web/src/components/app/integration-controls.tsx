"use client";

import { useState, useTransition } from "react";
import { PRIORITIES, TICKET_STATUSES, type PriorityId } from "@prepo/shared";
import {
  chooseLinearTeam,
  connectLinear,
  disconnectLinear,
  retryTicketSync,
  saveLinearMapping,
  setLinearSourceOfTruth,
  setLinearWebhookSecret,
  syncLinearNow,
} from "@/server/actions";
import type { LinearMapping } from "@/server/linear/mapping";

/**
 * Everything that talks to Linear from the browser. The server actions decide
 * the workspace id, the actor and whether the caller may do this at all; these
 * components only send what the user typed and show what came back.
 */

function useAction() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<{ ok?: boolean; reason?: string } | unknown>) {
    startTransition(async () => {
      try {
        const result = await work();
        if (
          result &&
          typeof result === "object" &&
          "ok" in result &&
          result.ok === false
        ) {
          setError(
            ("reason" in result && typeof result.reason === "string"
              ? result.reason
              : null) ?? "Linear refused that.",
          );
          return;
        }
        setError(null);
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : String(problem));
      }
    });
  }

  return { pending, error, run, setError };
}

const buttonClass =
  "rounded-2 bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50";
const quietButtonClass =
  "rounded-2 border border-border px-3 py-1.5 text-xs text-text-muted hover:bg-surface-2 disabled:opacity-50";
const inputClass =
  "h-9 w-full rounded-2 border border-border bg-surface-2 px-2.5 text-sm";

/** Linear's own priority scale, in Linear's own words. */
const LINEAR_PRIORITIES = [
  { value: 0, label: "No priority" },
  { value: 1, label: "Urgent" },
  { value: 2, label: "High" },
  { value: 3, label: "Medium" },
  { value: 4, label: "Low" },
];

/** Linear's workflow state *types*, what a status maps onto, not a state id. */
const LINEAR_STATE_TYPES = [
  { value: "backlog", label: "Backlog" },
  { value: "unstarted", label: "Unstarted" },
  { value: "started", label: "Started" },
  { value: "completed", label: "Completed" },
  { value: "canceled", label: "Cancelled (Prepo has no equivalent)" },
];

/* ------------------------------------------------------------- connecting */

/**
 * A personal API key, pasted. It is sent straight to the server action, tried
 * against Linear before anything is stored, and encrypted at rest.
 */
export function LinearConnect({
  workspace,
  canStore,
}: {
  workspace: string;
  canStore: boolean;
}) {
  const { pending, error, run } = useAction();
  const [token, setToken] = useState("");

  if (!canStore) {
    return (
      <p className="text-sm leading-relaxed text-text-muted">
        A token cannot be stored yet: this deployment has no{" "}
        <code className="rounded bg-surface-2 px-1 py-0.5 text-xs">
          INTEGRATION_ENCRYPTION_KEY
        </code>
        , and Prepo will not keep a credential it cannot encrypt. Set that
        variable and reload this page.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-xs text-text-subtle" htmlFor="linear-token">
        Linear personal API key
      </label>
      <input
        id="linear-token"
        type="password"
        value={token}
        autoComplete="off"
        placeholder="lin_api_…"
        onChange={(event) => setToken(event.target.value)}
        className={inputClass}
      />
      <p className="text-xs leading-relaxed text-text-subtle">
        Created in Linear under Settings → API → Personal API keys. Prepo tries
        it against Linear before storing anything, so a wrong key is rejected
        here rather than discovered later by a failed sync.
      </p>
      <button
        type="button"
        disabled={pending || token.trim().length < 10}
        onClick={() =>
          run(async () => {
            const result = await connectLinear({
              workspace,
              token: token.trim(),
            });
            if (result.ok) setToken("");
            return result;
          })
        }
        className={buttonClass}
      >
        {pending ? "Checking with Linear…" : "Connect Linear"}
      </button>
      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------- the team and project */

export function LinearTeamPicker({
  workspace,
  teams,
  projects,
  teamId,
  projectId,
}: {
  workspace: string;
  teams: { id: string; key: string; name: string }[];
  projects: { id: string; name: string }[];
  teamId: string | null;
  projectId: string | null;
}) {
  const { pending, error, run } = useAction();
  const [team, setTeam] = useState(teamId ?? "");
  const [project, setProject] = useState(projectId ?? "");
  // The projects on this page belong to the saved team, so a team the user has
  // just picked has no list yet, saving it first is what loads one.
  const teamChanged = team !== (teamId ?? "");

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs text-text-subtle" htmlFor="linear-team">
            Team
          </label>
          <select
            id="linear-team"
            value={team}
            onChange={(event) => {
              setTeam(event.target.value);
              setProject("");
            }}
            className={`${inputClass} mt-1`}
          >
            <option value="">Choose a team…</option>
            {teams.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.key} · {entry.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label
            className="block text-xs text-text-subtle"
            htmlFor="linear-project"
          >
            Project (optional)
          </label>
          <select
            id="linear-project"
            value={project}
            onChange={(event) => setProject(event.target.value)}
            className={`${inputClass} mt-1`}
            disabled={!team || teamChanged}
          >
            <option value="">
              {!team
                ? "Choose a team first"
                : teamChanged
                  ? "Save the team first"
                  : "No project"}
            </option>
            {projects.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      <button
        type="button"
        disabled={pending || !team}
        onClick={() =>
          run(() =>
            chooseLinearTeam({
              workspace,
              teamId: team,
              projectId: teamChanged ? null : project || null,
            }),
          )
        }
        className={buttonClass}
      >
        {pending ? "Saving…" : "Save"}
      </button>
      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

/* --------------------------------------------------------- the mapping */

function pairsToText(record: Record<string, string>): string {
  return Object.entries(record)
    .map(([from, to]) => `${from}=${to}`)
    .join("\n");
}

function textToPairs(text: string): Record<string, string> {
  const record: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator < 1) continue;
    const from = trimmed.slice(0, separator).trim();
    const to = trimmed.slice(separator + 1).trim();
    if (from && to) record[from] = to;
  }
  return record;
}

/**
 * The mapping table (PREPO.md §8.6), editable. Priority and status are the two
 * that change behaviour every day, so they are pickers; label and owner
 * overrides are the exceptions rather than the rule, so they are text.
 */
export function LinearMappingEditor({
  workspace,
  mapping,
}: {
  workspace: string;
  mapping: LinearMapping;
}) {
  const { pending, error, run } = useAction();
  const [priority, setPriority] = useState({ ...mapping.priority });
  const [status, setStatus] = useState({ ...mapping.status });
  const [labels, setLabels] = useState(pairsToText(mapping.labels));
  const [owners, setOwners] = useState(pairsToText(mapping.owners));

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium">Priority</p>
          <p className="mt-0.5 text-xs text-text-subtle">
            Prepo priority → Linear priority
          </p>
          <div className="mt-2 space-y-1.5">
            {PRIORITIES.map((id: PriorityId) => (
              <div key={id} className="flex items-center gap-2">
                <span className="w-8 font-mono text-xs text-text-subtle">
                  {id}
                </span>
                <select
                  value={priority[id] ?? 0}
                  onChange={(event) =>
                    setPriority((current) => ({
                      ...current,
                      [id]: Number(event.target.value),
                    }))
                  }
                  className="h-8 flex-1 rounded-2 border border-border bg-surface-2 px-2 text-xs"
                  aria-label={`Linear priority for ${id}`}
                >
                  {LINEAR_PRIORITIES.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-medium">Status</p>
          <p className="mt-0.5 text-xs text-text-subtle">
            Prepo status → Linear state type
          </p>
          <div className="mt-2 space-y-1.5">
            {TICKET_STATUSES.map((entry) => (
              <div key={entry.id} className="flex items-center gap-2">
                <span className="w-[92px] truncate text-xs text-text-subtle">
                  {entry.label}
                </span>
                <select
                  value={status[entry.id] ?? "unstarted"}
                  onChange={(event) =>
                    setStatus((current) => ({
                      ...current,
                      [entry.id]: event.target.value,
                    }))
                  }
                  className="h-8 flex-1 rounded-2 border border-border bg-surface-2 px-2 text-xs"
                  aria-label={`Linear state type for ${entry.label}`}
                >
                  {LINEAR_STATE_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium" htmlFor="linear-labels">
            Labels
          </label>
          <p className="mt-0.5 text-xs text-text-subtle">
            One <code className="font-mono">prepo=linear</code> per line. A label
            with no row is sent under its own name.
          </p>
          <textarea
            id="linear-labels"
            value={labels}
            rows={3}
            onChange={(event) => setLabels(event.target.value)}
            className="mt-2 w-full rounded-2 border border-border bg-surface-2 px-2.5 py-2 font-mono text-xs"
          />
        </div>
        <div>
          <label className="block text-xs font-medium" htmlFor="linear-owners">
            Owners
          </label>
          <p className="mt-0.5 text-xs text-text-subtle">
            One <code className="font-mono">prepo=linear</code> per line, for when
            someone&apos;s Linear address is not the one in Prepo.
          </p>
          <textarea
            id="linear-owners"
            value={owners}
            rows={3}
            onChange={(event) => setOwners(event.target.value)}
            className="mt-2 w-full rounded-2 border border-border bg-surface-2 px-2.5 py-2 font-mono text-xs"
          />
        </div>
      </div>

      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() =>
            saveLinearMapping({
              workspace,
              mapping: {
                priority,
                status,
                labels: textToPairs(labels),
                owners: textToPairs(owners),
              },
            }),
          )
        }
        className={buttonClass}
      >
        {pending ? "Saving…" : "Save mapping"}
      </button>
      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------ which side wins */

export function LinearSourceOfTruthControl({
  workspace,
  value,
}: {
  workspace: string;
  value: "prepo" | "linear";
}) {
  const { pending, error, run } = useAction();
  const [current, setCurrent] = useState(value);

  const options = [
    { id: "prepo" as const, label: "Prepo wins" },
    { id: "linear" as const, label: "Linear wins" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            disabled={pending}
            onClick={() => {
              setCurrent(option.id);
              run(() =>
                setLinearSourceOfTruth({ workspace, value: option.id }),
              );
            }}
            className={
              current === option.id
                ? "rounded-2 bg-text px-3 py-1.5 text-xs font-medium text-surface disabled:opacity-50"
                : quietButtonClass
            }
          >
            {option.label}
          </button>
        ))}
      </div>
      <p className="max-w-[65ch] text-xs leading-relaxed text-text-subtle">
        {current === "prepo"
          ? "A ticket Prepo is still sending keeps Prepo's own edit and the override is noted on the ticket. What Linear changes and Prepo also has queued is decided in Prepo's favour."
          : "A change from Linear is taken as final, including title, priority and due date, even when Prepo has an edit queued. Only the fields Linear sends are touched."}
      </p>
      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------ webhook secret */

export function LinearWebhookSecretControl({
  workspace,
  hasSecret,
}: {
  workspace: string;
  hasSecret: boolean;
}) {
  const { pending, error, run } = useAction();
  const [secret, setSecret] = useState("");

  return (
    <div className="space-y-3">
      <p className="text-xs leading-relaxed text-text-subtle">
        {hasSecret
          ? "A signing secret is stored, so deliveries are verified. Only enter a value here if you rotated it in Linear."
          : "Deliveries are not verified until a signing secret is stored. Linear shows one when you create the webhook."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="password"
          value={secret}
          autoComplete="off"
          placeholder="Signing secret"
          onChange={(event) => setSecret(event.target.value)}
          className={`${inputClass} max-w-xs`}
          aria-label="Linear webhook signing secret"
        />
        <button
          type="button"
          disabled={pending || secret.trim().length === 0}
          onClick={() =>
            run(async () => {
              const result = await setLinearWebhookSecret({
                workspace,
                secret: secret.trim(),
              });
              if (result.ok) setSecret("");
              return result;
            })
          }
          className={buttonClass}
        >
          {pending ? "Saving…" : "Store secret"}
        </button>
        {hasSecret ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => setLinearWebhookSecret({ workspace, secret: "" }))}
            className={quietButtonClass}
          >
            Remove
          </button>
        ) : null}
      </div>
      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

/* --------------------------------------------------------- running it */

/**
 * One pass, in this request. It is the same function the scheduler runs, which
 * is the whole point: pressing this proves what the cron would do.
 */
export function LinearSyncNow({ workspace }: { workspace: string }) {
  const { pending, error, run } = useAction();
  const [report, setReport] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(async () => {
            const result = await syncLinearNow({ workspace });
            if (!result.connected) {
              setReport("This workspace has no usable connection, so nothing was sent.");
              return result;
            }
            setReport(
              `Pulled and pushed: ${result.pushed} sent, ${result.failed} refused.` +
                (result.details.length
                  ? ` ${result.details.slice(0, 6).join(" · ")}`
                  : ""),
            );
            return result;
          })
        }
        className={buttonClass}
      >
        {pending ? "Syncing…" : "Sync now"}
      </button>
      {report ? (
        <p className="max-w-[75ch] text-xs leading-relaxed text-text-muted">
          {report}
        </p>
      ) : null}
      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

export function LinearDisconnect({ workspace }: { workspace: string }) {
  const { pending, error, run } = useAction();
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className={quietButtonClass}
      >
        Disconnect
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <p className="max-w-[65ch] text-xs leading-relaxed text-text-muted">
        Disconnecting forgets the token and unlinks every ticket from its issue.
        The tickets themselves stay in Prepo, and the issues stay in Linear.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => run(() => disconnectLinear({ workspace }))}
          className={buttonClass}
        >
          {pending ? "Disconnecting…" : "Yes, disconnect"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className={quietButtonClass}
        >
          Keep it
        </button>
      </div>
      {error ? <p className="text-xs text-accent-ink">{error}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------- ticket detail */

/**
 * The Linear half of a ticket: where it lives, or why it is not there yet
 * (PREPO.md §8.5). A failed sync is the one case that needs a click, so the
 * retry is here rather than buried on a settings page.
 */
export function TicketLinearSync({
  workspace,
  ticketId,
  state,
  error,
  url,
}: {
  workspace: string;
  ticketId: string;
  state: "pending" | "synced" | "failed" | null | undefined;
  error: string | null | undefined;
  url: string | null;
}) {
  const { pending, error: actionError, run } = useAction();
  const [queued, setQueued] = useState(false);

  const detail =
    state === "synced" ? (
      <span className="text-text-muted">Synced to Linear</span>
    ) : state === "pending" || queued ? (
      <span className="text-text-muted">
        Queued, the next sync sends it
      </span>
    ) : state === "failed" ? (
      <span className="text-accent-ink">Sync failed</span>
    ) : (
      <span className="text-text-muted">Not linked yet</span>
    );

  return (
    <div className="space-y-3">
      <p className="text-sm">{detail}</p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-accent-ink hover:underline"
        >
          Open the issue in Linear
        </a>
      ) : null}
      {error ? (
        <p className="max-w-[65ch] text-xs leading-relaxed text-text-subtle">
          Linear said: {error}
        </p>
      ) : null}
      {state === "failed" ? (
        <button
          type="button"
          disabled={pending || queued}
          onClick={() =>
            run(async () => {
              await retryTicketSync({ workspace, ticketId });
              setQueued(true);
              return { ok: true };
            })
          }
          className={quietButtonClass}
        >
          {queued ? "Queued" : pending ? "Queueing…" : "Retry sync"}
        </button>
      ) : null}
      {actionError ? (
        <p className="text-xs text-accent-ink">{actionError}</p>
      ) : null}
    </div>
  );
}
