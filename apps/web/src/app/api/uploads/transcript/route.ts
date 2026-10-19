import {
  appendParam,
  bodyTooLarge,
  fail,
  meetingFormUrl,
  meetingUrl,
  requireRouteWorkspace,
  succeed,
} from "@/server/audio/api";
import { ingestTranscript } from "@/server/audio/ingest";
import { MAX_TRANSCRIPT_CHARS, UploadRejected } from "@/server/audio/validate";

/**
 * `POST /api/uploads/transcript`, a caption file or pasted minutes.
 *
 * This is the path that needs no speech-to-text provider, so it is the one that
 * still works when nothing is configured (and it is the fallback the failure
 * state in PREPO.md §8.12 points at).
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
  let text = String(form.get("text") ?? "");
  let filename: string | undefined;

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_TRANSCRIPT_CHARS * 4) {
      return fail(request, {
        status: 413,
        back,
        message: "That transcript file is far larger than a meeting. Check the export.",
      });
    }
    text = await file.text();
    filename = file.name;
  }

  try {
    const outcome = await ingestTranscript({
      workspaceId: auth.workspace.id,
      actorId: auth.userId,
      title: String(form.get("title") ?? "") || filename?.replace(/\.[^.]+$/, "") || "Imported minutes",
      heldAt: heldAtFrom(form.get("heldAt")),
      filename,
      text,
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
    console.error("transcript import failed", error);
    return fail(request, {
      status: 500,
      back,
      message: "That transcript could not be imported. Nothing was saved, try again.",
    });
  }
}
