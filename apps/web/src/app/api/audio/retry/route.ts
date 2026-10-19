import { appendParam, meetingUrl, readAssetAction, succeed } from "@/server/audio/api";
import { retryTranscription } from "@/server/audio/ingest";

/**
 * `POST /api/audio/retry`, run the provider again for a recording that failed.
 *
 * When no provider is configured this reports that plainly instead of pretending
 * to retry, and the interface offers the transcript route alongside it
 * (PREPO.md §8.12).
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const parsed = await readAssetAction(request);
  if (parsed instanceof Response) return parsed;

  const outcome = await retryTranscription({
    workspaceId: parsed.auth.workspace.id,
    meetingId: parsed.meetingId,
    assetId: parsed.assetId,
    retentionDays: parsed.auth.workspace.settings.audioRetentionDays,
  });

  const back = `${meetingUrl(parsed.slug, parsed.meetingId)}?tab=transcript`;
  return succeed(request, {
    back,
    message: outcome.detail,
    location: appendParam(back, "notice", outcome.detail),
  });
}
