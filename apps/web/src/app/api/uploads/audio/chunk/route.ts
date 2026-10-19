import {
  appendParam,
  bodyTooLarge,
  fail,
  json,
  meetingFormUrl,
  meetingUrl,
  requireRouteWorkspace,
  succeed,
} from "@/server/audio/api";
import { ingestAudio } from "@/server/audio/ingest";
import { beginUpload, clearUpload, readUploadMeta, readStagedUpload, appendChunk } from "@/server/audio/storage";
import { MAX_CHUNK_BYTES, UploadRejected } from "@/server/audio/validate";

/**
 * `POST /api/uploads/audio/chunk`, a recording arriving in pieces.
 *
 * The browser recorder posts a piece at a time, so a dropped connection costs one
 * piece rather than the whole meeting (PREPO.md §6.1). Pieces are staged on disk
 * and assembled when the client marks the last one. Nothing is written to the
 * database until assembly succeeds, and a staged upload that is never finished is
 * reclaimed by the retention sweep.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (bodyTooLarge(request)) {
    return json({ error: "Payload too large" }, 413);
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return json({ error: "Expected a multipart form" }, 400);
  }

  const slug = String(form.get("workspace") ?? "");
  const back = meetingFormUrl(request, slug);
  const auth = await requireRouteWorkspace(slug);
  if (auth instanceof Response) return auth;

  const uploadId = String(form.get("uploadId") ?? "");
  const index = Number(form.get("index") ?? "");
  const isFinal = String(form.get("final") ?? "") === "1";
  const chunk = form.get("file");

  if (!(chunk instanceof File) || chunk.size === 0) {
    return json({ error: "Empty piece" }, 400);
  }
  if (chunk.size > MAX_CHUNK_BYTES) {
    return json({ error: "That piece is larger than the 4 MB piece cap." }, 413);
  }
  if (!Number.isInteger(index) || index < 0) {
    return json({ error: "Piece index must be a non-negative integer" }, 400);
  }

  const source = String(form.get("source") ?? "recording") === "upload" ? "upload" : "recording";
  const consent = String(form.get("consent") ?? "") === "on" || String(form.get("consent") ?? "") === "true";
  if (!consent) {
    return json(
      { error: "Recording requires confirming consent. Nothing was stored." },
      400,
    );
  }

  const totalBytes = Number(form.get("totalBytes") ?? "0");
  const durationRaw = Number(form.get("durationS") ?? "");

  try {
    if (index === 0) {
      await beginUpload(uploadId, {
        workspaceId: auth.workspace.id,
        userId: auth.userId,
        title: String(form.get("title") ?? ""),
        heldAt: String(form.get("heldAt") ?? ""),
        source,
        consent: true,
        filename: chunk.name.replace(/\.part$/, "") || "recording.webm",
        totalBytes: Number.isFinite(totalBytes) ? totalBytes : 0,
        nextIndex: 1,
        createdAt: new Date().toISOString(),
      });
    } else if (!(await readUploadMeta(uploadId))) {
      // The first piece never landed (a reload, a new device): start over rather
      // than appending into someone else's take.
      return json({ error: "That recording session has expired, start again." }, 409);
    }

    const received = await appendChunk(uploadId, index, new Uint8Array(await chunk.arrayBuffer()));

    if (!isFinal) {
      return json({ ok: true, uploadId, received });
    }

    const meta = await readUploadMeta(uploadId);
    const bytes = await readStagedUpload(uploadId);
    if (!meta || !bytes || bytes.byteLength === 0) {
      await clearUpload(uploadId);
      return json({ error: "No audio arrived for that recording." }, 400);
    }

    const outcome = await ingestAudio({
      workspaceId: auth.workspace.id,
      actorId: auth.userId,
      title: meta.title || "Recorded meeting",
      heldAt: meta.heldAt ? new Date(meta.heldAt) : new Date(),
      source: meta.source,
      filename: meta.filename,
      bytes,
      reportedDurationS: Number.isFinite(durationRaw) ? durationRaw : undefined,
      retentionDays: auth.workspace.settings.audioRetentionDays,
    });

    await clearUpload(uploadId);

    return succeed(request, {
      back,
      message: outcome.detail,
      location: appendParam(meetingUrl(slug, outcome.meetingId), "notice", outcome.detail),
    });
  } catch (error) {
    await clearUpload(uploadId).catch(() => {});
    if (error instanceof UploadRejected) {
      return fail(request, { status: 400, back, message: error.message });
    }
    console.error("chunked upload failed", error);
    return json({ error: "The recording could not be stored. Nothing was kept, try again." }, 500);
  }
}
