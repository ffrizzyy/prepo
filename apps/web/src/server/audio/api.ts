import { readSession } from "../auth/dal";
import { getWorkspace, getWorkspaceMembers, listWorkspacesForUser } from "../db/repo";
import type { WorkspaceSettings } from "../db/schema";

/**
 * Request plumbing for the upload and streaming endpoints.
 *
 * These are Route Handlers rather than Server Actions on purpose: an Action body
 * is capped at 1 MB by default, and a recording is not. They cannot use
 * `requireWorkspace` either, because that is built on `redirect()` and
 * `notFound()`, which is right for a page and wrong for an API: a fetch should be
 * told what went wrong with a status code, and a no-JavaScript form post should
 * be sent back to the page with the reason attached.
 */

export type RouteWorkspace = {
  userId: string;
  workspace: {
    id: string;
    slug: string;
    name: string;
    settings: WorkspaceSettings;
  };
};

/** A response is returned instead of a thrown error, so callers stay readable. */
export async function requireRouteWorkspace(
  slug: string,
): Promise<RouteWorkspace | Response> {
  const session = await readSession();
  if (!session) {
    return json({ error: "Sign in first." }, 401);
  }

  const memberships = await listWorkspacesForUser(session.userId);
  const membership = memberships.find((entry) => entry.slug === slug);
  if (!membership) {
    // Same as the page path: no confirmation that someone else's workspace
    // exists (PREPO.md §9.3 A01).
    return json({ error: "Not found." }, 404);
  }

  const workspace = await getWorkspace(membership.id);
  if (!workspace) return json({ error: "Not found." }, 404);

  const members = await getWorkspaceMembers(membership.id);
  if (!members.some((member) => member.userId === session.userId)) {
    return json({ error: "Not found." }, 404);
  }

  return {
    userId: session.userId,
    workspace: {
      id: workspace.id,
      slug: workspace.slug,
      name: workspace.name,
      settings: workspace.settings,
    },
  };
}

/**
 * A fetch gets JSON; a plain form post gets a redirect back to the page with the
 * reason in the query string, so ingest works with JavaScript switched off.
 */
export function wantsJson(request: Request): boolean {
  return (request.headers.get("accept") ?? "").includes("application/json");
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function fail(
  request: Request,
  input: { status: number; message: string; back: string },
): Response {
  if (wantsJson(request)) return json({ error: input.message }, input.status);
  return redirect(appendParam(input.back, "error", input.message));
}

export function succeed(
  request: Request,
  input: { back: string; message: string; location?: string },
): Response {
  const target = input.location ?? appendParam(input.back, "notice", input.message);
  if (wantsJson(request)) return json({ ok: true, message: input.message, location: target });
  return redirect(target);
}

export function redirect(location: string, status = 303): Response {
  return new Response(null, { status, headers: { location } });
}

export function appendParam(url: string, key: string, value: string): string {
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}${key}=${encodeURIComponent(value.slice(0, 400))}`;
}

/** The page a form post comes from, so a failure lands back on it. */
export function meetingFormUrl(request: Request, slug: string): string {
  const header = request.headers.get("referer");
  if (header) {
    try {
      const url = new URL(header);
      if (url.pathname === `/${slug}/meetings/new`) return `${url.pathname}${url.search}`;
    } catch {
      // A malformed referer is not worth an error; fall through to the default.
    }
  }
  return `/${slug}/meetings/new`;
}

export function meetingUrl(slug: string, meetingId: string): string {
  return `/${slug}/meetings/${meetingId}`;
}

const MAX_BODY_HEADER = 64 * 1024 * 1024;
/**
 * Shared preamble for the two single-asset actions: read the form, authorize the
 * workspace, and check the ids. Returns a Response when anything is wrong, so the
 * caller can `return` it directly.
 */
export async function readAssetAction(
  request: Request,
): Promise<
  | { slug: string; meetingId: string; assetId: string; auth: RouteWorkspace }
  | Response
> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return new Response("Expected a form", { status: 400 });
  }

  const slug = String(form.get("workspace") ?? "");
  const meetingId = String(form.get("meetingId") ?? "");
  const assetId = String(form.get("assetId") ?? "");
  const auth = await requireRouteWorkspace(slug);
  if (auth instanceof Response) return auth;

  const back = `${meetingUrl(slug, meetingId)}?tab=transcript`;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuid.test(meetingId)) {
    return fail(request, { status: 400, back, message: "Unknown meeting." });
  }
  if (!uuid.test(assetId)) {
    return fail(request, { status: 400, back, message: "Unknown recording." });
  }

  return { slug, meetingId, assetId, auth };
}

/**
 * Rejects a body that announces itself as too large before it is buffered. The
 * per-format caps are still applied afterwards — this only stops the server from
 * reading a file it is going to refuse.
 */
export function bodyTooLarge(request: Request): boolean {
  const declared = Number(request.headers.get("content-length") ?? "0");
  return Number.isFinite(declared) && declared > MAX_BODY_HEADER;
}
