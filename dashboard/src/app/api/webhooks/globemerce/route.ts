import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { db, schema } from "@/db";
import { processWebhookEvents } from "@/lib/globemerce";

export const runtime = "nodejs";

function tokenOk(req: NextRequest) {
  const expected = process.env.GLOBEMERCE_WEBHOOK_TOKEN ?? "";
  const got = req.nextUrl.searchParams.get("token") ?? req.headers.get("x-webhook-token") ?? "";
  if (!expected || got.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function POST(req: NextRequest) {
  if (!tokenOk(req)) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const text = await req.text();
  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    // Sebagian platform mengirim form-urlencoded.
    payload = Object.fromEntries(new URLSearchParams(text));
  }
  const [ev] = await db.insert(schema.webhookEvents).values({ source: "globemerce", payload: payload as object }).returning({ id: schema.webhookEvents.id });
  // Proses langsung; kalau gagal, event tetap tersimpan dan bisa diproses ulang dari dashboard.
  await processWebhookEvents([ev.id]).catch(() => undefined);
  return NextResponse.json({ ok: true, id: ev.id });
}
