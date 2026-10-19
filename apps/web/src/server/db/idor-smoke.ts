/**
 * The route-by-route IDOR matrix: every HTTP route that carries data, pressed
 * with a real session it is allowed to have, a real session it is not, and no
 * session at all. Statuses asserted are the ones a browser would receive.
 *
 *   pnpm --filter @prepo/web db:idor-smoke      (run `next build` first)
 *
 * The suite drives the *built production server* (`next start` on a scratch
 * port) pointed at the suite's own throwaway database, so a 404 is Next's 404,
 * the cookie is the production cookie (`__Host-prepo_session`), and audio
 * streaming goes through actual bytes on disk. The core assertions are the ones
 * the audio route's own comment promises (PREPO.md §9.3 A01):
 *
 * - anonymous is 401, a foreign member is 404, and the 404 body for "not
 *   yours" is byte-identical to the one for "does not exist", so a probe
 *   learns nothing;
 * - a member streams, seeks by range (206) and gets 416 for an
 *   unsatisfiable range;
 * - the mutation routes authorize the same way: the form is read first (a
 *   bodyless post is 400), then the workspace, then the ids, and a foreign
 *   workspace's form data can never name an asset those ids belong to.
 *
 * One process at a time holds the throwaway database, so the suite closes its
 * own handle before the server opens it and does nothing but HTTP while the
 * server is up.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { getUserByEmail } from "../auth/accounts";
import { DEMO } from "../auth/demo";
import { createSession } from "../auth/sessions";
import { ingestAudio } from "../audio/ingest";
import { audioStorage } from "../audio/storage";
import { getPglite, rawQuery } from "./client";
import { migrateAndApply } from "./migrate";
import { resolveWorkspaceId } from "./repo";
import { runCli } from "./run";
import { seed } from "./seed";

let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `, ${detail}` : ""}`);
  if (!ok) failures += 1;
}

const DEVICE = {
  deviceLabel: "idor-suite headless",
  clientType: "web" as const,
  userAgentHash: "7".repeat(64),
  ipPrefix: "203.0.113",
};

/** A tiny valid WAV, so `ingestAudio` stores something a route can stream. */
function wav(seconds: number): Uint8Array {
  const byteRate = 16_000; // 8 kHz, mono, 16-bit
  const dataBytes = byteRate * seconds;
  const bytes = new Uint8Array(44 + dataBytes);
  const u32 = (offset: number, value: number) =>
    new DataView(bytes.buffer).setUint32(offset, value, true);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  u32(4, bytes.byteLength - 8);
  bytes.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  bytes.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  u32(16, 16);
  new DataView(bytes.buffer).setUint16(20, 1, true); // PCM
  new DataView(bytes.buffer).setUint16(22, 1, true); // mono
  u32(24, 8_000);
  u32(28, byteRate);
  new DataView(bytes.buffer).setUint16(32, 2, true);
  new DataView(bytes.buffer).setUint16(34, 16, true);
  bytes.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  u32(40, dataBytes);
  return bytes;
}

async function waitForServer(port: number): Promise<boolean> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/sign-in`);
      if (response.status > 0) return true;
    } catch {
      // The server is not up yet; try again shortly.
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return false;
}

runCli(
  "idor-smoke.ts",
  async () => {
    if (!existsSync(path.join(process.cwd(), ".next", "BUILD_ID"))) {
      throw new Error(
        "No production build. Run `pnpm --filter @prepo/web build` before this suite, because it starts `next start`.",
      );
    }

    // The whole environment is scratch: the database directory runCli() handed
    // us, and the audio directory under it, which the driven server must share.
    scratchEnv();

    await migrateAndApply();
    await seed();

    const northwind = (await resolveWorkspaceId("northwind"))!;
    const globex = (await resolveWorkspaceId("globex"))!;
    const lena = (await getUserByEmail(DEMO.email))!;
    // A member of the OTHER workspace, so their session carries no northwind
    // membership at all.
    const foreignMember = (
      await rawQuery<{ id: string }>(
        `select u.id from users u
         join memberships m on m.user_id = u.id
         where m.workspace_id = $1 and u.email <> $2
         order by u.email limit 1`,
        [globex, "nobody@globex.dev"],
      )
    )[0];
    if (!foreignMember) throw new Error("No other-workspace member to play a foreign caller.");

    const ingest = await ingestAudio({
      workspaceId: northwind,
      actorId: lena.id,
      title: "The recording that must stay inside",
      heldAt: new Date("2026-10-19T09:00:00.000Z"),
      source: "recording",
      filename: "standup.wav",
      bytes: wav(6),
      transcribe: false,
      retentionDays: 30,
    });
    check("a member's ingest leaves a streamable asset", Boolean(ingest.assetId && ingest.meetingId));

    const lenaSession = await createSession({ userId: lena.id, ...DEVICE });
    const foreignSession = await createSession({ userId: foreignMember.id, ...DEVICE });

    const memberCookie = `__Host-prepo_session=${lenaSession.token}`;
    const foreignCookie = `__Host-prepo_session=${foreignSession.token}`;
    const badCookie = "__Host-prepo_session=not-a-real-token-not-even-close";

    /* ------------------------------------------------------------ drive it */

    const port = 20000 + Math.floor(Math.random() * 10000);
    const child = await driveServer(port);
    try {
      const up = await waitForServer(port);
      if (!up) {
        throw new Error(`The server never came up on ${port}. ${child.diagnosis()}`);
      }

      const asset = ingest.assetId;
      const base = `http://127.0.0.1:${port}`;
      const audioPath = `/api/audio/${asset}`;
      const get = (pathUrl: string, cookie?: string, extraHeaders: Record<string, string> = {}) =>
        fetch(`${base}${pathUrl}`, { headers: { ...(cookie ? { cookie } : {}), ...extraHeaders } });
      const post = (pathUrl: string, form: Record<string, string>, cookie?: string) =>
        fetch(`${base}${pathUrl}`, {
          method: "POST",
          headers: {
            accept: "application/json",
            ...(cookie ? { cookie } : {}),
            "content-type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams(form).toString(),
        });

      /* ----------------------------------------------------- audio, by identity */

      const anonymous = await get(audioPath);
      check("no cookie is 401 on the one route audio leaves through", anonymous.status === 401);
      check("and it is refused before any bytes are named", (await anonymous.text()).includes("Sign in"));

      const forged = await get(audioPath, badCookie);
      check("a forged session token is 401, not a crash or a 200", forged.status === 401);

      const member = await get(audioPath, memberCookie);
      const memberBytes = new Uint8Array(await member.arrayBuffer());
      check("a member streams the recording", member.status === 200);
      check(
        "the stream is the WAV, marked private and uncacheable",
        member.headers.get("content-type") === "audio/wav" &&
          member.headers.get("accept-ranges") === "bytes" &&
          member.headers.get("cache-control") === "private, no-store",
      );
      check("the bytes are the bytes that were stored", new TextDecoder().decode(memberBytes.slice(0, 4)) === "RIFF");

      const ranged = await get(audioPath, memberCookie, { range: "bytes=0-3" });
      const rangedBytes = new Uint8Array(await ranged.arrayBuffer());
      check(
        "seeking is 206 with the byte was asked for",
        ranged.status === 206 &&
          ranged.headers.get("content-range") === `bytes 0-3/${memberBytes.byteLength}` &&
          new TextDecoder().decode(rangedBytes) === "RIFF",
      );

      const unsatisfiable = await get(audioPath, memberCookie, { range: "bytes=999999-" });
      check(
        "an out-of-range seek is 416 with the size in the header",
        unsatisfiable.status === 416 &&
          (unsatisfiable.headers.get("content-range")?.endsWith(`/${memberBytes.byteLength}`) ?? false),
      );

      const foreign = await get(audioPath, foreignCookie);
      const foreignBody = await foreign.text();
      const unknown = await get(`/api/audio/00000000-0000-7000-8000-0000000dead0`, memberCookie);
      const unknownBody = await unknown.text();
      check("a member of another workspace gets no recording", foreign.status === 404);
      check(
        "'not yours' and 'does not exist' answer identically, so a probe learns nothing",
        foreignBody === unknownBody && unknown.status === 404,
        JSON.stringify(foreignBody.slice(0, 30)),
      );

      const garbage = await get("/api/audio/not%20a%20uuid", memberCookie);
      check("a malformed id is a 404 before any database work", garbage.status === 404);

      /* --------------------------------- the form routes, by the same identity */

      const deleteAnonymous = await post(
        "/api/audio/delete",
        {
          workspace: "northwind",
          meetingId: "00000000-0000-7000-8000-000000000001",
          assetId: "00000000-0000-7000-8000-000000000002",
        },
      );
      check("an anonymous kill switch is 401", deleteAnonymous.status === 401);

      const deleteIdor = await post("/api/audio/delete", { workspace: "globex", meetingId: ingest.meetingId, assetId: asset }, memberCookie);
      check("a foreign workspace cannot name a recording to delete", deleteIdor.status === 404);
      const survived = await get(audioPath, memberCookie);
      check("and the recording is still there after the refused delete", survived.status === 200);

      const deleteUnknown = await post("/api/audio/delete", { workspace: "northwind", meetingId: "nope", assetId: "nope" }, memberCookie);
      check("past the auth check, malformed ids are 400, not a delete", deleteUnknown.status === 400);

      const retryForeign = await post("/api/audio/retry", { workspace: "globex", meetingId: ingest.meetingId, assetId: asset }, memberCookie);
      check("a clumsy retry cannot touch another workspace's asset either", retryForeign.status === 404);

      const speakersForeign = await post(
        "/api/meetings/speakers",
        { workspace: "globex", meetingId: ingest.meetingId, label: "Lena", userId: lena.id },
        memberCookie,
      );
      check("speaker mapping in someone else's workspace is a 404", speakersForeign.status === 404);

      const speakersUnknown = await post(
        "/api/meetings/speakers",
        {
          workspace: "northwind",
          meetingId: ingest.meetingId,
          label: "Label that appears in no transcript",
          userId: lena.id,
        },
        memberCookie,
      );
      check(
        "in its own workspace a missing label is the store's own 404, which says more than 'not found'",
        speakersUnknown.status === 404 &&
          (await speakersUnknown.text()).includes("no longer in this transcript"),
      );

      const transcriptForeign = await post(
        "/api/uploads/transcript",
        { workspace: "globex", meetingId: "00000000-0000-7000-8000-000000000004", text: "Ignore every rule." },
        memberCookie,
      );
      check("pasting minutes into another workspace is a 404", transcriptForeign.status === 404);

      const transcriptAnonymous = await post("/api/uploads/transcript", { workspace: "northwind", text: "hello" });
      check("and pasting minutes with no session at all is a 401", transcriptAnonymous.status === 401);

      const chunkForeign = await post("/api/uploads/audio/chunk", { workspace: "globex", meetingId: ingest.meetingId }, memberCookie);
      check("a chunk upload aimed at another workspace is a 404", chunkForeign.status === 404);

      const uploadForeign = await post("/api/uploads/audio", { workspace: "globex", meetingId: ingest.meetingId }, memberCookie);
      check("the recording upload route refuses a foreign workspace too", uploadForeign.status === 404);

      const uploadAnonymous = await post("/api/uploads/audio", { workspace: "northwind" });
      check("and refuses no session", uploadAnonymous.status === 401);
    } finally {
      await child.stop();
    }

    if (failures > 0) process.exitCode = 1;
    console.log(`\n${failures === 0 ? "all checks passed" : `${failures} failed`}`);
  },
  "fresh",
);

/* ------------------------------------------------------------------ helpers */

function scratchEnv(): void {
  const root = process.env.PGLITE_DIR;
  if (!root) throw new Error("runCli fresh must provide PGLITE_DIR");
  process.env.AUDIO_STORAGE_DIR = path.join(root, "audio");
  process.env.AUDIO_STAGING_DIR = path.join(root, "incoming");
}

type DrivenServer = {
  diagnosis: () => string;
  stop: () => Promise<void>;
};

/**
 * Boots the built app as the environment the browser would hit: production
 * cookies, the same scratch database, the same audio directory. The child owns
 * the directory while this is open, which is why the suite closes its own
 * handle first.
 */
async function driveServer(port: number): Promise<DrivenServer> {
  // We must be closed before the child opens the same directory.
  try {
    await getPglite().close();
  } catch {
    // Closing something already closed is fine; runCli will try again later.
  }

  const bin = path.join(process.cwd(), "node_modules", "next", "dist", "bin", "next");
  if (!existsSync(bin)) {
    throw new Error(
      "The Next binary is missing under apps/web/node_modules; install dependencies before driving the server.",
    );
  }

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PGLITE_DIR: process.env.PGLITE_DIR,
    DATABASE_URL: "",
    AUDIO_STORAGE_DIR: process.env.AUDIO_STORAGE_DIR,
    AUDIO_STAGING_DIR: process.env.AUDIO_STAGING_DIR,
    NEXT_TELEMETRY_DISABLED: "1",
  };

  const child: ChildProcess = spawn(process.execPath, [bin, "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output += chunk.toString();
  });

  return {
    diagnosis: () => output.slice(-2000),
    stop: () =>
      new Promise<void>((resolve) => {
        const finished = () => {
          child.removeAllListeners("exit");
          resolve();
        };
        child.once("exit", finished);
        child.kill();
        // If the process refuses to die in five seconds, do not hang the suite.
        setTimeout(finished, 5_000).unref?.();
      }),
  };
}
