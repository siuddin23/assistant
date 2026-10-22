import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import { upsertOrder } from "./order-upsert";
import { normalizePayment } from "./import-apply";
import { clean, normalizeAwb, normalizePhone, parseDate, parseIdr } from "./parse";
import { normalizeShipStatus } from "./shipping";
import { getPath } from "./globemerce-paths";

export { getPath, listPaths } from "./globemerce-paths";

export const WEBHOOK_KIND = "globemerce_webhook";

/** Field order -> path JSON di payload, mis. "data.customer.phone" atau "items[0].name". */
export const WEBHOOK_FIELDS = [
  { key: "externalId", label: "ID order", required: true },
  { key: "orderDate", label: "Tanggal order", required: true },
  { key: "omzet", label: "Total / omzet", required: true },
  { key: "customerName", label: "Nama customer" },
  { key: "customerPhone", label: "No. HP / WA" },
  { key: "address", label: "Alamat" },
  { key: "city", label: "Kota" },
  { key: "productType", label: "Produk / paket" },
  { key: "paymentMethod", label: "Metode bayar" },
  { key: "csCode", label: "CS" },
  { key: "courier", label: "Ekspedisi" },
  { key: "shippingCost", label: "Ongkir" },
  { key: "awb", label: "No. resi" },
  { key: "shipStatusRaw", label: "Status" },
  { key: "category", label: "Kategori (O/F/R)" },
] as const;

export async function getWebhookMapping(): Promise<Record<string, string> | null> {
  const [m] = await db
    .select()
    .from(schema.importMappings)
    .where(and(eq(schema.importMappings.kind, WEBHOOK_KIND), eq(schema.importMappings.name, "default")));
  return m?.mapping ?? null;
}

/** Proses event webhook yang tersimpan menjadi order. */
export async function processWebhookEvents(ids?: number[]) {
  const mapping = await getWebhookMapping();
  const events = await db
    .select()
    .from(schema.webhookEvents)
    .where(
      ids?.length
        ? inArray(schema.webhookEvents.id, ids)
        : and(eq(schema.webhookEvents.source, "globemerce"), inArray(schema.webhookEvents.status, ["baru", "belum_dipetakan", "error"])),
    )
    .orderBy(desc(schema.webhookEvents.id))
    .limit(500);

  let processed = 0;
  for (const ev of events) {
    if (!mapping) {
      await db.update(schema.webhookEvents).set({ status: "belum_dipetakan" }).where(eq(schema.webhookEvents.id, ev.id));
      continue;
    }
    try {
      const get = (f: string) => getPath(ev.payload, mapping[f] ?? "");
      const externalId = clean(get("externalId"));
      const orderDate = parseDate(get("orderDate")) ?? parseDate(ev.receivedAt);
      if (!externalId || !orderDate) throw new Error("ID order atau tanggal tidak ditemukan di payload");
      const awb = normalizeAwb(get("awb"));
      const statusRaw = clean(get("shipStatusRaw"));
      const cat = clean(get("category"))?.toUpperCase();
      const { id } = await db.transaction((tx) =>
        upsertOrder(tx, {
          keys: [`globemerce:${externalId}`],
          order: {
            orderDate,
            omzet: parseIdr(get("omzet")),
            customerName: clean(get("customerName")),
            customerPhone: normalizePhone(get("customerPhone")),
            address: clean(get("address")),
            city: clean(get("city")),
            productType: clean(get("productType"))?.toUpperCase() ?? null,
            paymentMethod: normalizePayment(get("paymentMethod")),
            csCode: clean(get("csCode"))?.toUpperCase() ?? null,
            courier: clean(get("courier")),
            shippingCost: parseIdr(get("shippingCost")) || null,
            awb,
            shipStatus: normalizeShipStatus(statusRaw) ?? (awb ? "dalam_perjalanan" : "belum_kirim"),
            shipStatusRaw: statusRaw,
            category: cat === "O" || cat === "F" || cat === "R" ? cat : null,
            source: "globemerce",
          },
        }),
      );
      await db.update(schema.webhookEvents).set({ status: "diproses", error: null, orderId: id }).where(eq(schema.webhookEvents.id, ev.id));
      processed++;
    } catch (e) {
      await db
        .update(schema.webhookEvents)
        .set({ status: "error", error: e instanceof Error ? e.message : String(e) })
        .where(eq(schema.webhookEvents.id, ev.id));
    }
  }
  return { total: events.length, processed, mapped: !!mapping };
}
