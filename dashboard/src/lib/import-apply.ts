import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ImportKind } from "./import-fields";
import { upsertOrder } from "./order-upsert";
import { clean, normalizeAwb, normalizePhone, parseDate, parseDateTime, parseIdr } from "./parse";
import { normalizeShipStatus, shouldUpdateStatus } from "./shipping";

export type ImportPayload = {
  kind: ImportKind;
  source: string; // "globemerce" / "everpro" / "lainnya"
  filename: string;
  headers: string[];
  rows: unknown[][];
  mapping: Record<string, string>; // field -> judul kolom
};

export type ImportResult = {
  batchId: number;
  total: number;
  inserted: number;
  updated: number;
  skipped: number;
  unmatched: number;
  errors: string[];
};

export async function applyImport(p: ImportPayload, userId?: number): Promise<ImportResult> {
  const idx = Object.fromEntries(Object.entries(p.mapping).filter(([, h]) => h).map(([f, h]) => [f, p.headers.indexOf(h)]));
  const get = (row: unknown[], field: string) => (idx[field] >= 0 && idx[field] !== undefined ? row[idx[field]] : undefined);
  const rows = p.rows.filter((r) => r.some((c) => c != null && String(c).trim() !== ""));
  const res: ImportResult = { batchId: 0, total: rows.length, inserted: 0, updated: 0, skipped: 0, unmatched: 0, errors: [] };

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(schema.importBatches)
      .values({ kind: p.kind, source: p.source, filename: p.filename, createdBy: userId })
      .returning({ id: schema.importBatches.id });
    res.batchId = batch.id;

    if (p.kind === "orders") {
      for (const [i, row] of rows.entries()) {
        const orderDate = parseDate(get(row, "orderDate"));
        const omzet = parseIdr(get(row, "omzet"));
        if (!orderDate) {
          res.skipped++;
          res.errors.push(`Baris ${i + 2}: tanggal tidak terbaca (${String(get(row, "orderDate") ?? "")})`);
          continue;
        }
        const awb = normalizeAwb(get(row, "awb"));
        const phone = normalizePhone(get(row, "customerPhone"));
        const statusRaw = clean(get(row, "shipStatusRaw"));
        const cat = clean(get(row, "category"))?.toUpperCase();
        const externalId = clean(get(row, "externalId"));
        const keys = [
          externalId && `${p.source}:${externalId}`,
          awb && `${p.source}:awb:${awb}`,
          `${p.source}:${orderDate}:${phone ?? "-"}:${omzet}`,
        ].filter(Boolean) as string[];
        const { result } = await upsertOrder(tx, {
          keys,
          order: {
            orderDate,
            omzet,
            customerName: clean(get(row, "customerName")),
            customerPhone: phone,
            address: clean(get(row, "address")),
            city: clean(get(row, "city")),
            productType: clean(get(row, "productType"))?.toUpperCase() ?? null,
            paymentMethod: normalizePayment(get(row, "paymentMethod")),
            category: cat === "O" || cat === "F" || cat === "R" ? cat : null,
            csCode: clean(get(row, "csCode"))?.toUpperCase() ?? null,
            courier: clean(get(row, "courier")),
            shippingCost: parseIdr(get(row, "shippingCost")) || null,
            awb,
            shipStatus: normalizeShipStatus(statusRaw) ?? (awb ? "dalam_perjalanan" : "belum_kirim"),
            shipStatusRaw: statusRaw,
            notes: clean(get(row, "notes")),
            source: p.source,
          },
        });
        if (result === "inserted") res.inserted++;
        else if (result === "unchanged") res.skipped++;
        else res.updated++;
      }
    }

    if (p.kind === "shipments") {
      const parsed = rows
        .map((row) => ({
          row,
          awb: normalizeAwb(get(row, "awb")),
          statusRaw: clean(get(row, "statusRaw")),
          eventAt: parseDateTime(get(row, "eventAt")),
          courier: clean(get(row, "courier")),
          shippingCost: parseIdr(get(row, "shippingCost")) || null,
        }))
        .filter((x) => x.awb);
      res.skipped += rows.length - parsed.length;
      const awbs = [...new Set(parsed.map((x) => x.awb!))];
      const existing = awbs.length ? await tx.select().from(schema.orders).where(inArray(schema.orders.awb, awbs)) : [];
      const byAwb = new Map(existing.map((o) => [o.awb!, o]));

      for (const x of parsed) {
        const status = normalizeShipStatus(x.statusRaw);
        if (!status) {
          res.skipped++;
          res.errors.push(`Resi ${x.awb}: status "${x.statusRaw ?? ""}" tidak dikenali`);
          continue;
        }
        await tx.insert(schema.shipmentUpdates).values({
          awb: x.awb!, status, statusRaw: x.statusRaw, eventAt: x.eventAt, source: p.source, importBatchId: batch.id,
          raw: Object.fromEntries(p.headers.map((h, i) => [h, x.row[i] ?? null])),
        });
        const order = byAwb.get(x.awb!);
        if (!order) {
          res.unmatched++;
          continue;
        }
        const patch: Partial<typeof schema.orders.$inferInsert> = {};
        if (status !== order.shipStatus && shouldUpdateStatus(order.shipStatus, status)) {
          Object.assign(patch, { shipStatus: status, shipStatusRaw: x.statusRaw, shipStatusAt: x.eventAt ?? new Date() });
          order.shipStatus = status;
        }
        if (!order.courier && x.courier) patch.courier = x.courier;
        if (!order.shippingCost && x.shippingCost) patch.shippingCost = x.shippingCost;
        if (Object.keys(patch).length) {
          await tx.update(schema.orders).set({ ...patch, updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
          res.updated++;
        } else res.skipped++;
      }
    }

    if (p.kind === "settlements") {
      for (const row of rows) {
        const awb = normalizeAwb(get(row, "awb"));
        if (!awb) {
          res.skipped++;
          continue;
        }
        const codAmount = parseIdr(get(row, "codAmount"));
        const shippingFee = parseIdr(get(row, "shippingFee"));
        const codFee = parseIdr(get(row, "codFee"));
        const otherFee = parseIdr(get(row, "otherFee"));
        const net = get(row, "netAmount");
        const values = {
          awb,
          settlementDate: parseDate(get(row, "settlementDate")),
          codAmount,
          shippingFee,
          codFee,
          otherFee,
          netAmount: net != null && String(net).trim() !== "" ? parseIdr(net) : codAmount - shippingFee - codFee - otherFee,
          batchRef: clean(get(row, "batchRef")) ?? "",
          source: p.source,
          importBatchId: batch.id,
          raw: Object.fromEntries(p.headers.map((h, i) => [h, row[i] ?? null])),
        };
        const r = await tx
          .insert(schema.codSettlements)
          .values(values)
          .onConflictDoUpdate({ target: [schema.codSettlements.awb, schema.codSettlements.batchRef], set: values })
          .returning({ inserted: schema.codSettlements.createdAt });
        if (r.length) res.inserted++;
      }
      const awbs = [...new Set(rows.map((r) => normalizeAwb(get(r, "awb"))).filter(Boolean) as string[])];
      if (awbs.length) {
        const matched = await tx.select({ awb: schema.orders.awb }).from(schema.orders).where(inArray(schema.orders.awb, awbs));
        res.unmatched = awbs.length - new Set(matched.map((m) => m.awb)).size;
      }
    }

    await tx
      .update(schema.importBatches)
      .set({ totalRows: res.total, inserted: res.inserted, updated: res.updated, skipped: res.skipped, errors: res.errors.slice(0, 200) })
      .where(eq(schema.importBatches.id, batch.id));
  });
  return res;
}

export function normalizePayment(v: unknown): string | null {
  const s = clean(v)?.toUpperCase();
  if (!s) return null;
  if (/COD|BAYAR DI TEMPAT/.test(s)) return "COD";
  if (/TRANSFER|TF|BANK|VA|VIRTUAL/.test(s)) return "TF";
  if (/QR/.test(s)) return "QR";
  if (/CC|KARTU|CREDIT/.test(s)) return "CC";
  return s;
}
