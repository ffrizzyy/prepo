import {
  bodyTooLarge,
  fail,
  meetingFormUrl,
  meetingUrl,
  appendParam,
  requireRouteWorkspace,
  succeed,
} from "@/server/audio/api";
import { ingestAudio } from "@/server/audio/ingest";
import { UploadRejected, MAX_AUDIO_BYTES } from "@/server/audio/validate";

/**
 * `POST /api/uploads/audio`, one complete recording.
 *
 * A plain `<form enctype="multipart/form-data">` can post here with JavaScript
 * switched off, which is why the success path is a redirect to the meeting rather
 * than a JSON body that only a client could read. The recorder posts to the chunk
 * endpoint instead, so a dropped connection does not lose the take.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function heldAtFrom(value: FormDataEntryValue | null): Date {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return new Date();
  const parsed = new Date(raw.length === 10 ? `${raw}T09:00:00.000Z` : raw);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function POST(request: Request): Promise<Response> {
  if (bodyTooLarge(request)) {
    return new Response("Payload too large", { status: 413 });
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Expected a multipart form", { status: 400 });
  }

  const slug = String(form.get("workspace") ?? "");
  const back = meetingFormUrl(request, slug);
  const auth = await requireRouteWorkspace(slug);
  if (auth instanceof Response) return auth;

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return fail(request, { status: 400, back, message: "Choose a recording to upload." });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return fail(request, {
      status: 413,
      back,
      message: "That recording is larger than the 25 MB cap. Split it, or upload a transcript instead.",
    });
  }

  const source = String(form.get("source") ?? "upload") === "recording" ? "recording" : "upload";
  const consent = String(form.get("consent") ?? "") === "on" || String(form.get("consent") ?? "") === "true";
  if (!consent) {
    return fail(request, {
      status: 400,
      back,
      message:
        "Recording requires confirming that everyone in the meeting knows it is being recorded. Consent is stored with the audio.",
    });
  }

  const durationRaw = Number(form.get("durationS") ?? "");
  const bytes = new Uint8Array(await file.arrayBuffer());

  try {
    const outcome = await ingestAudio({
      workspaceId: auth.workspace.id,
      actorId: auth.userId,
      title: String(form.get("title") ?? "") || file.name.replace(/\.[^.]+$/, ""),
      heldAt: heldAtFrom(form.get("heldAt")),
      source,
      filename: file.name,
      bytes,
      reportedDurationS: Number.isFinite(durationRaw) ? durationRaw : undefined,
      retentionDays: auth.workspace.settings.audioRetentionDays,
    });

    return succeed(request, {
      back,
      message: outcome.detail,
      location: appendParam(meetingUrl(slug, outcome.meetingId), "notice", outcome.detail),
    });
  } catch (error) {
    if (error instanceof UploadRejected) {
      return fail(request, { status: 400, back, message: error.message });
    }
    console.error("audio upload failed", error);
    return fail(request, {
      status: 500,
      back,
      message: "The recording could not be stored. Nothing was kept, try again.",
    });
  }
}
