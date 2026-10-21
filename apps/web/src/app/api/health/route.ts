import { NextResponse } from "next/server";
import { rawQuery } from "@/server/db/client";

/**
 * The host's health check. It proves the process is up *and* that the database
 * it was configured with answers; a 503 is a real failure, not a warm-up.
 *
 * It deliberately says nothing about which database or whether migrations are
 * current: that belongs to the deploy log and `db:verify`, not to a public
 * endpoint.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await rawQuery("select 1");
    return NextResponse.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { ok: false },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
