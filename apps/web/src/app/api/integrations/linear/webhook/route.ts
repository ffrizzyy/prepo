import { and, eq } from "drizzle-orm";
import { getDb, withWorkspace } from "@/server/db/client";
import * as t from "@/server/db/schema";
import { decryptSecret, integratingKey } from "@/server/linear/crypto";
import { readMapping } from "@/server/linear/mapping";
import { applyRemoteChange } from "@/server/linear/sync";
import {
  SIGNATURE_HEADER,
  changeFromEvent,
  parseEvent,
  verifySignature,
} from "@/server/linear/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * `POST /api/integrations/linear/webhook`, Linear saying what changed.
 *
 * The order of checks matters and is deliberate:
 *
 * 1. The body is parsed and its timestamp window checked. It has to be parsed
 *    before it can be verified, because the signing secret belongs to a
 *    *workspace* and the workspace is named by the payload's team. Nothing is
 *    acted on until step 3 succeeds, so parsing first is not a trust decision.
 * 2. The team is mapped to a workspace, reading as the database owner, the one
 *    place in the app that looks up a workspace before it can switch into it.
 * 3. The HMAC is verified against that workspace's stored secret, in constant
 *    time. A missing secret is refused rather than treated as "no verification
 *    needed", which is how a webhook endpoint quietly becomes unauthenticated.
 * 4. The change is applied through the same function the pull uses, so a
 *    webhook and a poll cannot resolve a conflict differently.
 *
 * A team this deployment does not mirror answers 200 with a reason: that is a
 * configuration choice, not a delivery failure, and a 4xx would have Linear
 * retrying it forever.
 */

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text();

  const parsed = parseEvent(body);
  if (!parsed.ok) {
    return json(400, { accepted: false, why: parsed.reason });
  }

  const event = parsed.event;
  const teamId = event.data.team?.id ?? event.data.teamId ?? null;
  if (!teamId) {
    return json(400, {
      accepted: false,
      why: "The payload names no team, so no workspace can be chosen.",
    });
  }

  const [integration] = await getDb()
    .select()
    .from(t.integrations)
    .where(
      and(
        eq(t.integrations.provider, "linear"),
        eq(t.integrations.teamId, teamId),
      ),
    );

  if (!integration || !integration.encryptedToken) {
    return json(200, {
      accepted: false,
      why: "No connected Linear team mirrors this one, so nothing was changed.",
    });
  }

  const key = integratingKey(process.env);
  const secret = key
    ? decryptSecret(integration.encryptedWebhookSecret, key)
    : null;

  if (!secret) {
    return json(400, {
      accepted: false,
      why: "This workspace has no webhook secret stored, so the delivery cannot be verified. Set one on the integrations page.",
    });
  }

  if (
    !verifySignature({
      body,
      signature: request.headers.get(SIGNATURE_HEADER),
      secret,
    })
  ) {
    return json(401, { accepted: false, why: "The signature does not match." });
  }

  const change = changeFromEvent(event, teamId);
  if (!change || !change.meaningful) {
    return json(200, {
      accepted: true,
      applied: "ignored",
      why: "Nothing the sync acts on changed.",
    });
  }

  const workspaceId = integration.workspaceId;
  const result = await withWorkspace(workspaceId, (tx) =>
    applyRemoteChange(tx, {
      workspaceId,
      patch: change.patch,
      mapping: readMapping(integration.mapping),
      sourceOfTruth:
        integration.sourceOfTruth === "linear" ? "linear" : "prepo",
      removed: change.removed,
    }),
  );

  return json(200, { accepted: true, applied: result });
}
