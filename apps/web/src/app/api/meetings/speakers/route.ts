import { appendParam, fail, meetingUrl, requireRouteWorkspace, succeed } from "@/server/audio/api";
import { mapSpeaker } from "@/server/writes";

/**
 * `POST /api/meetings/speakers` — map a transcript label to a person.
 *
 * A plain form post, so a mislabelled speaker can be corrected with JavaScript
 * switched off, and the result is a redirect back to the transcript tab rather
 * than a JSON response the page would have to interpret.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Expected a form", { status: 400 });
  }

  const slug = String(form.get("workspace") ?? "");
  const meetingId = String(form.get("meetingId") ?? "");
  const auth = await requireRouteWorkspace(slug);
  if (auth instanceof Response) return auth;

  const back = `${meetingUrl(slug, meetingId)}?tab=transcript`;
  if (!UUID_RE.test(meetingId)) {
    return fail(request, { status: 400, back, message: "Unknown meeting." });
  }

  const label = String(form.get("label") ?? "").trim();
  if (label.length === 0) {
    return fail(request, { status: 400, back, message: "That transcript has no speaker label to map." });
  }

  const rawUser = String(form.get("userId") ?? "");
  // An empty value is "unassign", which is a real action rather than an error.
  const userId = rawUser === "" ? null : rawUser;
  if (userId !== null && !UUID_RE.test(userId)) {
    return fail(request, { status: 400, back, message: "Unknown person." });
  }

  const renameTo = String(form.get("renameTo") ?? "").trim().slice(0, 80);

  const updated = await mapSpeaker({
    workspaceId: auth.workspace.id,
    meetingId,
    actorId: auth.userId,
    label,
    userId,
    renameTo: renameTo.length > 0 ? renameTo : undefined,
  });

  if (updated === 0) {
    return fail(request, { status: 404, back, message: "That speaker label is no longer in this transcript." });
  }

  const message = userId
    ? `${updated} line${updated === 1 ? "" : "s"} now attributed to the person you picked.`
    : `${updated} line${updated === 1 ? "" : "s"} unassigned.`;

  return succeed(request, { back, message, location: appendParam(back, "notice", message) });
}
