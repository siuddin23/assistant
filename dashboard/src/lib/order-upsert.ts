import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db, schema } from "@/db";
import type { NewOrder, Order } from "@/db/schema";
import { shouldUpdateStatus } from "./shipping";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type UpsertInput = {
  order: Omit<NewOrder, "sourceRef">;
  items?: { productCode: string; qty: number }[];
  /** Kunci dari sumber yang sama, urut prioritas. Kunci pertama disimpan sebagai source_ref. */
  keys: string[];
};

export type UpsertResult = "inserted" | "updated" | "merged" | "unchanged";

const FIELDS: (keyof UpsertInput["order"])[] = [
  "orderDate", "csCode", "customerName", "customerPhone", "address", "city", "productType",
  "paymentMethod", "category", "omzet", "courier", "shippingCost", "insurance", "awb", "notes",
];

/**
 * Simpan order dari sumber luar tanpa membuat duplikat:
 * 1. Cocok dengan kunci sumber yang sama  -> perbarui (kecuali sudah diedit manual di dashboard).
 * 2. Cocok dengan resi yang sama, atau HP+tanggal+omzet sama dari sumber lain -> isi kolom yang kosong saja.
 * 3. Tidak cocok -> buat order baru.
 */
export async function upsertOrder(tx: Tx, input: UpsertInput): Promise<{ result: UpsertResult; id: number }> {
  const { order, items = [], keys } = input;

  const [sameSource] = await tx.select().from(schema.orders).where(inArray(schema.orders.sourceRef, keys)).limit(1);
  if (sameSource) {
    const patch: Partial<NewOrder> = sameSource.editedInApp ? {} : pick(order, FIELDS);
    Object.assign(patch, statusPatch(sameSource, order));
    // Naikkan kunci ke yang lebih kuat (mis. baris sheet yang sekarang sudah punya resi).
    if (sameSource.sourceRef !== keys[0]) {
      const [taken] = await tx.select({ id: schema.orders.id }).from(schema.orders).where(eq(schema.orders.sourceRef, keys[0]));
      if (!taken) patch.sourceRef = keys[0];
    }
    const changed = diff(sameSource, patch);
    if (!Object.keys(changed).length) return { result: "unchanged", id: sameSource.id };
    await tx.update(schema.orders).set({ ...changed, updatedAt: new Date() }).where(eq(schema.orders.id, sameSource.id));
    if (!sameSource.editedInApp && items.length) await replaceItems(tx, sameSource.id, items);
    return { result: "updated", id: sameSource.id };
  }

  const other = await findCrossSource(tx, order);
  if (other) {
    const patch: Partial<NewOrder> = {};
    for (const f of FIELDS) {
      const cur = other[f as keyof Order];
      const next = order[f as keyof UpsertInput["order"]];
      if ((cur == null || cur === "" || cur === 0) && next != null && next !== "") (patch as Record<string, unknown>)[f] = next;
    }
    Object.assign(patch, statusPatch(other, order));
    const changed = diff(other, patch);
    if (Object.keys(changed).length) {
      await tx.update(schema.orders).set({ ...changed, updatedAt: new Date() }).where(eq(schema.orders.id, other.id));
      return { result: "merged", id: other.id };
    }
    return { result: "unchanged", id: other.id };
  }

  const [created] = await tx
    .insert(schema.orders)
    .values({ ...order, sourceRef: keys[0] })
    .returning({ id: schema.orders.id });
  if (items.length) await replaceItems(tx, created.id, items);
  return { result: "inserted", id: created.id };
}

async function findCrossSource(tx: Tx, order: UpsertInput["order"]): Promise<Order | undefined> {
  if (order.awb) {
    // Resi yang sama di sumber yang sama = baris berbeda yang sah (mis. dua paket dalam satu resi).
    const [byAwb] = await tx
      .select()
      .from(schema.orders)
      .where(and(eq(schema.orders.awb, order.awb), ne(schema.orders.source, order.source ?? "manual")))
      .limit(1);
    if (byAwb) return byAwb;
  }
  if (order.customerPhone && order.orderDate && order.omzet) {
    const rows = await tx
      .select()
      .from(schema.orders)
      .where(
        and(
          eq(schema.orders.customerPhone, order.customerPhone),
          eq(schema.orders.orderDate, order.orderDate),
          eq(schema.orders.omzet, order.omzet),
        ),
      )
      .limit(2);
    // Hanya gabungkan kalau tidak ambigu, dan bukan dari sumber yang sama (dua order sah di hari yang sama).
    const candidates = rows.filter((r) => r.source !== order.source);
    if (rows.length === 1 && candidates.length === 1) return candidates[0];
  }
  return undefined;
}

function statusPatch(cur: Order, next: UpsertInput["order"]): Partial<NewOrder> {
  if (!next.shipStatus || next.shipStatus === cur.shipStatus) {
    return next.shipStatusRaw && next.shipStatusRaw !== cur.shipStatusRaw && next.shipStatus === cur.shipStatus
      ? { shipStatusRaw: next.shipStatusRaw, shipStatusAt: next.shipStatusAt ?? cur.shipStatusAt }
      : {};
  }
  if (!shouldUpdateStatus(cur.shipStatus, next.shipStatus)) return {};
  return { shipStatus: next.shipStatus, shipStatusRaw: next.shipStatusRaw ?? null, shipStatusAt: next.shipStatusAt ?? new Date() };
}

async function replaceItems(tx: Tx, orderId: number, items: { productCode: string; qty: number }[]) {
  await tx.delete(schema.orderItems).where(eq(schema.orderItems.orderId, orderId));
  if (items.length) await tx.insert(schema.orderItems).values(items.map((i) => ({ ...i, orderId })));
}

function pick<T extends object>(o: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {};
  for (const k of keys) if (o[k] !== undefined) out[k] = o[k];
  return out;
}

function diff(cur: Order, patch: Partial<NewOrder>): Partial<NewOrder> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const c = cur[k as keyof Order];
    const same = c instanceof Date && v instanceof Date ? c.getTime() === v.getTime() : c === v;
    if (!same) out[k] = v;
  }
  return out as Partial<NewOrder>;
}
