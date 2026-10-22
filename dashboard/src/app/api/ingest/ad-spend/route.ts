import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";

export const runtime = "nodejs";

const Body = z.object({
  rows: z.array(z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    account_id: z.string(),
    account_name: z.string().optional(),
    spend: z.number(),
    purchases: z.number().optional(),
    purchase_value: z.number().optional(),
    impressions: z.number().optional(),
    link_clicks: z.number().optional(),
  })).max(5000),
});

/** Dipanggil job Python harian: Authorization: Bearer <INGEST_TOKEN>. */
export async function POST(req: NextRequest) {
  const expected = process.env.INGEST_TOKEN ?? "";
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!expected || got.length !== expected.length || !timingSafeEqual(Buffer.from(got), Buffer.from(expected)))
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues[0].message }, { status: 400 });
  const values = parsed.data.rows.map((r) => ({
    date: r.date, accountId: r.account_id, accountName: r.account_name ?? null, spend: Math.round(r.spend),
    purchases: Math.round(r.purchases ?? 0), purchaseValue: Math.round(r.purchase_value ?? 0),
    impressions: Math.round(r.impressions ?? 0), linkClicks: Math.round(r.link_clicks ?? 0),
  }));
  if (values.length) {
    await db.insert(schema.adSpendDaily).values(values).onConflictDoUpdate({
      target: [schema.adSpendDaily.date, schema.adSpendDaily.accountId],
      set: {
        accountName: sql`excluded.account_name`, spend: sql`excluded.spend`, purchases: sql`excluded.purchases`,
        purchaseValue: sql`excluded.purchase_value`, impressions: sql`excluded.impressions`, linkClicks: sql`excluded.link_clicks`,
      },
    });
  }
  return NextResponse.json({ ok: true, upserted: values.length });
}
