import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { syncSpreadsheet } from "@/lib/sheet-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Dipanggil terjadwal (GitHub Actions / Vercel Cron): Authorization: Bearer <CRON_SECRET>. */
export async function GET(req: NextRequest) {
  const expected = process.env.CRON_SECRET ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  try {
    const stats = await syncSpreadsheet();
    return NextResponse.json({ ok: true, stats: stats.map(({ warnings, ...s }) => ({ ...s, warnings: warnings.length })) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
