import { appendParam, fail, meetingUrl, readAssetAction, succeed } from "@/server/audio/api";
import { removeAudioBlob } from "@/server/audio/retention";
import { markAudioDeleted } from "@/server/writes";

/**
 * `POST /api/audio/delete`, destroy the recording, keep the transcript.
 *
 * This is the "delete a meeting and all derived data including audio" control at
 * its smallest useful size (PREPO.md §8.9), and it is also what a person reaches
 * for before the retention clock runs out.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const parsed = await readAssetAction(request);
  if (parsed instanceof Response) return parsed;

  const back = `${meetingUrl(parsed.slug, parsed.meetingId)}?tab=transcript`;

  const { storageKey } = await markAudioDeleted({
    workspaceId: parsed.auth.workspace.id,
    actorId: parsed.auth.userId,
    assetId: parsed.assetId,
  });

  if (!storageKey) {
    return fail(request, { status: 404, back, message: "That recording is already gone." });
  }

  await removeAudioBlob(storageKey);

  const message = "Audio deleted. The transcript and everything derived from it are untouched.";
  return succeed(request, { back, message, location: appendParam(back, "notice", message) });
}
