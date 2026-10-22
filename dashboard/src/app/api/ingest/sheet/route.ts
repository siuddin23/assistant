import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { MONTH_TABS } from "@/lib/sheet";
import { importSheetRows } from "@/lib/sheet-sync";

export const runtime = "nodejs";
export const maxDuration = 300;

const Body = z.object({
  tab: z.string().refine((t) => MONTH_TABS.includes(t.toUpperCase()), "Nama tab harus nama bulan, mis. OKTOBER"),
  values: z.array(z.array(z.unknown())).max(20000),
});

/** Dipanggil Google Apps Script di spreadsheet: Authorization: Bearer <INGEST_TOKEN>. */
export async function POST(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  const s = await importSheetRows(parsed.data.tab.toUpperCase(), parsed.data.values);
  return NextResponse.json({ ok: true, tab: s.tab, total: s.total, inserted: s.inserted, updated: s.updated, unchanged: s.unchanged, warnings: s.warnings.length });
}
