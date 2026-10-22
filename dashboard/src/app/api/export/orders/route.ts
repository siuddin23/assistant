import { NextResponse, type NextRequest } from "next/server";
import { asc } from "drizzle-orm";
import { db, schema } from "@/db";
import { currentUser } from "@/lib/auth";
import { orderWhere } from "@/lib/order-filters";
import { rangeFrom } from "@/lib/search-params";

export const runtime = "nodejs";

const COLS: [string, keyof typeof schema.orders.$inferSelect][] = [
  ["id", "id"], ["tanggal", "orderDate"], ["cs", "csCode"], ["nama", "customerName"], ["hp", "customerPhone"],
  ["kota", "city"], ["alamat", "address"], ["paket", "productType"], ["bayar", "paymentMethod"], ["kategori", "category"],
  ["omzet", "omzet"], ["ekspedisi", "courier"], ["ongkir", "shippingCost"], ["resi", "awb"], ["status", "shipStatus"],
  ["status_detail", "shipStatusRaw"], ["catatan", "notes"], ["sumber", "source"],
];

const esc = (v: unknown) => {
  const s = v == null ? "" : v instanceof Date ? v.toISOString() : String(v);
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: NextRequest) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const sp = Object.fromEntries(req.nextUrl.searchParams);
  const range = rangeFrom(sp);
  const list = await db.select().from(schema.orders).where(orderWhere(sp, range)).orderBy(asc(schema.orders.orderDate), asc(schema.orders.id));
  const csv = [COLS.map((c) => c[0]).join(","), ...list.map((r) => COLS.map(([, k]) => esc(r[k])).join(","))].join("\n");
  return new NextResponse("﻿" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="order_${range.from}_${range.to}.csv"`,
    },
  });
}
