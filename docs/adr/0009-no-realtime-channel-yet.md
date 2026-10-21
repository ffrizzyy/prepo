# ADR 0009: No realtime channel in the built app; IDs-only if one is added

- Status: Accepted. Recorded 21 October 2026.
- Supersedes: none.

## Context

The specification picks Ably for realtime sync: per-workspace capability tokens,
and events that carry IDs only so a client refetches through the authorized API.
This repository has no Ably account, no `ABLY_API_KEY`, and no socket client. The
question is whether to add a channel now, for a single-instance app with no
hosted origin, or to leave the pages server-rendered.

## Decision

No realtime channel is built. Pages are React Server Components; a mutation is a
server action that writes and calls `revalidatePath`, and the next render shows
the result. Two tabs converge when either is refreshed or navigated.

If a channel is added, the specification's IDs-only rule is the design:

- The server issues a short-lived token scoped to one workspace, never a
  workspace-wide key to the browser.
- A published event carries the entity type and id, not the row. The client
  refetches through the same authorized route it would use on navigation.
- Channel names include the workspace id, and the capability cannot subscribe to
  another tenant's channel.

## Consequences

- A user with two tabs open will not see the other tab's change until a refresh
  or an action. The notification badge is server-rendered for the same reason.
- Email and the follow-up ladder are the asynchronous channels that exist; there
  is no push subscription either (the `push_subscriptions` table is declared but
  unused, and no VAPID key is configured).
- No fan-out cost, no token endpoint, no channel authorization review, and no
  second source of truth for state. For a demo with one user, a socket would add
  moving parts without a visible behaviour that the refresh does not already
  provide.
- The IDs-only rule is recorded here so that "just send the row" is not the
  first implementation when a channel is added. A payload carrying content would
  leak to anyone holding a capability token and would persist in channel
  history.

## Alternatives considered

- **Ably now, as specified.** Rejected: a hosted dependency and a token
  endpoint, for a benefit no current flow can demonstrate.
- **Server-Sent Events from the Next.js process.** Rejected: a long-lived
  connection per client on a serverless host is the wrong shape, and it would
  need the same authorization design.
- **Polling every few seconds.** Rejected: it turns an idle page into constant
  database load to hide a refresh the user can perform.

## Evidence

`apps/web/src/server/actions.ts` (`revalidateWorkspace`),
`apps/web/src/app/[workspace]/layout.tsx` (server-rendered unread count),
`apps/web/src/server/db/schema.ts` (`pushSubscriptions`, unused),
`PREPO.md` 1.2 and 4.x (the Ably intent), `README.md`'s follow-up and
notification sections.
