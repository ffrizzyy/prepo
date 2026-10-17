import { readSession } from "@/server/auth/dal";
import { audioStorage } from "@/server/audio/storage";
import { contentTypeForKey } from "@/server/audio/validate";
import { listWorkspacesForUser } from "@/server/db/repo";
import { findAudioAsset } from "@/server/writes";

/**
 * `GET /api/audio/[assetId]` — the only way a recording leaves the server.
 *
 * The specification's rule is that audio is never reachable by a public link,
 * only through a short-lived URL issued after an authorization check
 * (PREPO.md §9.3 A01). This is that check: the session is resolved, and then the
 * asset is looked for *inside each of the caller's own workspaces*, so the
 * database's row-level security is what decides whether the row is even visible.
 * There is no presigning step because there is no bucket; the equivalent
 * guarantee is that the bytes never have an address a browser could guess.
 *
 * Range support is not optional here: without `206 Partial Content` the browser
 * cannot seek, and seeking into a transcript line is the whole point of the
 * player.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound(message = "Recording not found."): Response {
  return new Response(message, {
    status: 404,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
  });
}

type ResolvedRange = { start: number; end: number } | "unsatisfiable" | null;

function parseRange(header: string | null, size: number): ResolvedRange {
  if (!header) return null;
  const match = header.match(/^bytes=(\d*)-(\d*)$/);
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  let start: number;
  let end: number;

  if (rawStart === "") {
    // A suffix range: the last N bytes.
    const length = Number(rawEnd);
    if (!Number.isFinite(length) || length <= 0) return "unsatisfiable";
    start = Math.max(size - length, 0);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd === "" ? size - 1 : Number(rawEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return "unsatisfiable";
    end = Math.min(end, size - 1);
  }

  if (start > end || start >= size || start < 0) return "unsatisfiable";
  return { start, end };
}

function filenameFor(key: string, meetingId: string): string {
  const extension = key.includes(".") ? key.slice(key.lastIndexOf(".")) : ".audio";
  return `prepo-${meetingId}${extension}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
): Promise<Response> {
  const { assetId } = await params;
  if (!UUID_RE.test(assetId)) return notFound();

  const session = await readSession();
  if (!session) {
    return new Response("Sign in to play a recording.", {
      status: 401,
      headers: { "cache-control": "no-store" },
    });
  }

  const memberships = await listWorkspacesForUser(session.userId);
  let asset: Awaited<ReturnType<typeof findAudioAsset>> = null;
  for (const membership of memberships) {
    asset = await findAudioAsset({ workspaceId: membership.id, assetId });
    if (asset) break;
  }

  if (!asset || asset.status === "deleted") return notFound();

  const size = await audioStorage().size(asset.r2Key);
  if (size === null) {
    // The seeded example's row is real but its bytes were never shipped, and
    // retention can also have taken them. Either way there is nothing to play.
    return notFound("This recording has no stored audio.");
  }

  const contentType = contentTypeForKey(asset.r2Key);
  const headers = new Headers({
    "content-type": contentType,
    "accept-ranges": "bytes",
    // Private and uncacheable: a shared cache must never hold a recording.
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "content-disposition": `inline; filename="${filenameFor(asset.r2Key, asset.meetingId)}"`,
  });

  const range = parseRange(request.headers.get("range"), size);
  if (range === "unsatisfiable") {
    headers.set("content-range", `bytes */${size}`);
    return new Response(null, { status: 416, headers });
  }

  if (range) {
    const bytes = await audioStorage().readRange(asset.r2Key, range.start, range.end);
    if (!bytes) return notFound();
    headers.set("content-range", `bytes ${range.start}-${range.end}/${size}`);
    headers.set("content-length", String(bytes.byteLength));
    return new Response(bytes as unknown as BodyInit, { status: 206, headers });
  }

  const bytes = await audioStorage().read(asset.r2Key);
  headers.set("content-length", String(bytes.byteLength));
  return new Response(bytes as unknown as BodyInit, { status: 200, headers });
}
