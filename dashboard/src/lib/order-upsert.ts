import "server-only";
import { and, arrayOverlaps, between, eq, inArray, ne, or, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NewOrder, Order } from "@/db/schema";
import { shouldUpdateStatus } from "./shipping";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type UpsertInput = {
  order: Omit<NewOrder, "sourceRef" | "altRefs">;
  items?: { productCode: string; qty: number }[];
  /** Kunci dari sumber yang sama, urut prioritas. Kunci pertama disimpan sebagai source_ref. */
  keys: string[];
  /** Jangan gabungkan ke order dari sumber lain (mis. order yang dibatalkan). */
  noMerge?: boolean;
};

export type UpsertResult = "inserted" | "updated" | "merged" | "unchanged";

const FIELDS: (keyof UpsertInput["order"])[] = [
  "orderDate", "csCode", "customerName", "customerPhone", "address", "city", "productType",
  "paymentMethod", "category", "omzet", "productCost", "courier", "shippingCost", "insurance", "awb", "notes",
];

const DAY = 86400000;
const shiftDate = (iso: string, days: number) => new Date(Date.parse(iso) + days * DAY).toISOString().slice(0, 10);

/**
 * Simpan order dari sumber luar tanpa membuat duplikat:
 * 1. Kunci sumber yang sama pernah disimpan -> perbarui. Bila order itu milik sumber lain
 *    (hasil penggabungan), hanya isi kolom yang kosong.
 * 2. Ada order dari sumber lain dengan resi sama, atau HP + omzet sama dengan tanggal ±3 hari
 *    -> gabungkan: isi kolom yang kosong saja, catat kuncinya di alt_refs.
 * 3. Tidak cocok -> buat order baru.
 */
export async function upsertOrder(tx: Tx, input: UpsertInput): Promise<{ result: UpsertResult; id: number }> {
  const { order, items = [], keys } = input;
  const source = order.source ?? "manual";

  const [known] = await tx
    .select()
    .from(schema.orders)
    .where(or(inArray(schema.orders.sourceRef, keys), arrayOverlaps(schema.orders.altRefs, keys)))
    .limit(1);

  if (known && known.source === source) {
    // Sel kosong di sumber tidak menghapus data yang sudah diisi sumber lain (mis. resi dari Everpro).
    const patch: Partial<NewOrder> = known.editedInApp ? {} : pickFilled(order, FIELDS);
    Object.assign(patch, statusPatch(known, order));
    // Naikkan kunci ke yang lebih kuat (mis. baris sheet yang sekarang sudah punya resi).
    if (known.sourceRef !== keys[0]) {
      const [taken] = await tx.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.sourceRef, keys[0]));
      if (!taken) patch.sourceRef = keys[0];
    }
    const changed = diff(known, patch);
    if (!Object.keys(changed).length) return { result: "unchanged", id: known.id };
    await tx.update(schema.orders).set({ ...changed, updatedAt: new Date() }).where(eq(schema.orders.id, known.id));
    if (!known.editedInApp && items.length) await replaceItems(tx, known.id, items);
    return { result: "updated", id: known.id };
  }

  const target = known ?? (input.noMerge ? undefined : await findCrossSource(tx, order, source));
  if (target) {
    const patch = fillEmpty(target, order);
    Object.assign(patch, statusPatch(target, order));
    if (!target.altRefs.includes(keys[0])) patch.altRefs = [...target.altRefs, keys[0]];
    const changed = diff(target, patch);
    if (!Object.keys(changed).length) return { result: "unchanged", id: target.id };
    await tx.update(schema.orders).set({ ...changed, updatedAt: new Date() }).where(eq(schema.orders.id, target.id));
    return { result: "merged", id: target.id };
  }

  const [created] = await tx
    .insert(schema.orders)
    .values({ ...order, sourceRef: keys[0] })
    .returning({ id: schema.orders.id });
  if (items.length) await replaceItems(tx, created.id, items);
  return { result: "inserted", id: created.id };
}

async function findCrossSource(tx: Tx, order: UpsertInput["order"], source: string): Promise<Order | undefined> {
  const o = schema.orders;
  // Order sumber lain yang belum pernah digabung dengan order dari sumber ini.
  const notLinked = sql`not exists (select 1 from unnest(${o.altRefs}) r where r like ${source + ":%"})`;
  const live = ne(o.shipStatus, "batal");

  if (order.awb) {
    const [byAwb] = await tx.select().from(o).where(and(eq(o.awb, order.awb), ne(o.source, source), live)).limit(1);
    if (byAwb) return byAwb;
  }
  if (order.customerPhone && order.orderDate && order.omzet) {
    const rows = await tx
      .select()
      .from(o)
      .where(
        and(
          eq(o.customerPhone, order.customerPhone),
          eq(o.omzet, order.omzet),
          between(o.orderDate, shiftDate(order.orderDate, -3), shiftDate(order.orderDate, 3)),
          ne(o.source, source),
          live,
          notLinked,
        ),
      )
      .limit(5);
    // Pilih tanggal terdekat, tapi hanya kalau tidak seri (ambigu).
    const dist = (r: Order) => Math.abs(Date.parse(r.orderDate) - Date.parse(order.orderDate));
    rows.sort((a, b) => dist(a) - dist(b));
    if (rows.length === 1 || (rows.length > 1 && dist(rows[0]) < dist(rows[1]))) return rows[0];
  }
  return undefined;
}

function fillEmpty(cur: Order, next: UpsertInput["order"]): Partial<NewOrder> {
  const patch: Record<string, unknown> = {};
  for (const f of FIELDS) {
    const c = cur[f as keyof Order];
    const v = next[f];
    if ((c == null || c === "" || c === 0) && v != null && v !== "") patch[f] = v;
  }
  return patch as Partial<NewOrder>;
}

function statusPatch(cur: Order, next: UpsertInput["order"]): Partial<NewOrder> {
  if (!next.shipStatus) return {};
  // Status sama: teks detail hanya diisi bila belum ada, supaya sumber yang berbeda tidak saling menimpa.
  if (next.shipStatus === cur.shipStatus) return next.shipStatusRaw && !cur.shipStatusRaw ? { shipStatusRaw: next.shipStatusRaw } : {};
  // Status "belum dikirim" dari sumber lain tidak boleh menurunkan status yang sudah diketahui.
  if (next.shipStatus === "belum_kirim" || !shouldUpdateStatus(cur.shipStatus, next.shipStatus)) return {};
  return { shipStatus: next.shipStatus, shipStatusRaw: next.shipStatusRaw ?? null, shipStatusAt: next.shipStatusAt ?? new Date() };
}

async function replaceItems(tx: Tx, orderId: number, items: { productCode: string; qty: number }[]) {
  await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  if (items.length) await tx.insert(schema.orderItems).values(items.map((i) => ({ ...i, orderId })));
}

function pickFilled<T extends object>(o: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) {
    const v = o[k] as unknown;
    if (v !== undefined && v !== null && v !== "" && v !== 0) out[k] = o[k];
  }
  return out;
}

function diff(cur: Order, patch: Partial<NewOrder>): Partial<NewOrder> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const c = cur[k as keyof Order];
    const same =
      c instanceof Date && v instanceof Date ? c.getTime() === v.getTime()
      : Array.isArray(c) && Array.isArray(v) ? c.join("\u0000") === v.join("\u0000")
      : c === v;
    if (!same) out[k] = v;
  }
  return out as Partial<NewOrder>;
}
