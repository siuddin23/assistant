import "server-only";
import { and, between, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { ShipStatus } from "@/db/schema";
import type { ImportKind } from "./import-fields";
import { upsertOrder } from "./order-upsert";
import { clean, normalizeAwb, normalizePhone, parseDate, parseDateTime, parseIdr, parseItems } from "./parse";
import { normalizeShipStatus, shouldUpdateStatus } from "./shipping";
import { importSheetRows } from "./sheet-sync";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type ImportPayload = {
  kind: ImportKind;
  source: string;
  filename: string;
  headers: string[];
  rows: unknown[][];
  mapping: Record<string, string>; // field -> judul kolom
  sheetTab?: string; // khusus kind "sheet"
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

type Getter = (row: unknown[], field: string) => unknown;

export async function applyImport(p: ImportPayload, userId?: number): Promise<ImportResult> {
  if (p.kind === "sheet") {
    if (!p.sheetTab) throw new Error("Pilih nama tab bulan");
    const s = await importSheetRows(p.sheetTab, p.rows, userId);
    return { batchId: 0, total: s.total, inserted: s.inserted, updated: s.updated, skipped: s.skipped + s.unchanged, unmatched: 0, errors: s.warnings };
  }

  const idx = Object.fromEntries(Object.entries(p.mapping).filter(([, h]) => h).map(([f, h]) => [f, p.headers.indexOf(h)]));
  const get: Getter = (row, field) => (idx[field] !== undefined && idx[field] >= 0 ? row[idx[field]] : undefined);
  const rows = p.rows.filter((r) => r.some((c) => c != null && String(c).trim() !== ""));
  const res: ImportResult = { batchId: 0, total: rows.length, inserted: 0, updated: 0, skipped: 0, unmatched: 0, errors: [] };
  const rawOf = (row: unknown[]) => Object.fromEntries(p.headers.map((h, i) => [h, row[i] ?? null]));

  await db.transaction(async (tx) => {
    const [batch] = await tx
      .insert(schema.importBatches)
      .values({ kind: p.kind, source: p.source, filename: p.filename, createdBy: userId })
      .returning({ id: schema.importBatches.id });
    res.batchId = batch.id;

    if (p.kind === "orders") await importOrders(tx, p, rows, get, res);
    else if (p.kind === "everpro_orders") await importEverpro(tx, p, rows, get, res, batch.id, rawOf);
    else if (p.kind === "customers") await importCustomers(tx, p, rows, get, res);
    else if (p.kind === "shipments") await importShipments(tx, p, rows, get, res, batch.id, rawOf);
    else if (p.kind === "settlements") await importSettlements(tx, p, rows, get, res, batch.id, rawOf);

    await tx
      .update(schema.importBatches)
      .set({ totalRows: res.total, inserted: res.inserted, updated: res.updated, skipped: res.skipped, errors: res.errors.slice(0, 200) })
      .where(eq(schema.importBatches.id, batch.id));
  });
  return res;
}

async function importOrders(tx: Tx, p: ImportPayload, rows: unknown[][], get: Getter, res: ImportResult) {
  const codes = (await tx.select({ code: schema.products.code }).from(schema.products)).map((x) => x.code);
  for (const [i, row] of rows.entries()) {
    const orderDate = parseDate(get(row, "orderDate"));
    if (!orderDate) {
      res.skipped++;
      res.errors.push(`Baris ${i + 2}: tanggal tidak terbaca (${String(get(row, "orderDate") ?? "")})`);
      continue;
    }
    const omzet = parseIdr(get(row, "omzet"));
    const awb = normalizeAwb(get(row, "awb"));
    const phone = normalizePhone(get(row, "customerPhone"));
    const statusRaw = clean(get(row, "shipStatusRaw"));
    const orderStatus = clean(get(row, "orderStatus"));
    const cancelled = !!orderStatus && /cancel|batal|void|refund/i.test(orderStatus);
    const externalId = clean(get(row, "externalId"));
    let cat = clean(get(row, "category"))?.toUpperCase();
    if (cat !== "O" && cat !== "F" && cat !== "R") {
      const rep = clean(get(row, "isRepeat"));
      cat = rep == null ? undefined : /^(1|ya|yes|true)$/i.test(rep) ? "R" : "O";
    }
    const productText = clean(get(row, "productType"));
    const items = parseItems(productText, codes);
    const shipStatus: ShipStatus = cancelled ? "batal" : normalizeShipStatus(statusRaw) ?? (awb ? "dalam_perjalanan" : "belum_kirim");
    const keys = [
      externalId && `${p.source}:${externalId}`,
      awb && `${p.source}:awb:${awb}`,
      `${p.source}:${orderDate}:${phone ?? "-"}:${omzet}`,
    ].filter(Boolean) as string[];
    const { result } = await upsertOrder(tx, {
      keys,
      items,
      noMerge: cancelled, // order batal (sering duplikat dari order yang dibuat ulang) jangan menimpa order lain
      order: {
        orderDate,
        omzet,
        productCost: parseIdr(get(row, "productCost")) || null,
        customerName: clean(get(row, "customerName")),
        customerPhone: phone,
        address: cleanAddress(get(row, "address"), awb),
        city: clean(get(row, "city")),
        productType: items.length ? items.map((x) => `${x.qty} ${x.productCode}`).join(" + ") : productText?.toUpperCase() ?? null,
        paymentMethod: normalizePayment(get(row, "paymentMethod")),
        category: (cat as "O" | "F" | "R" | undefined) ?? null,
        csCode: clean(get(row, "csCode"))?.toUpperCase() ?? null,
        courier: clean(get(row, "courier"))?.replace(/^Marketplace\s+/i, "") ?? null,
        shippingCost: parseIdr(get(row, "shippingCost")) || null,
        awb,
        shipStatus,
        shipStatusRaw: cancelled ? orderStatus : statusRaw,
        notes: clean(get(row, "notes")),
        source: p.source,
      },
    });
    if (result === "inserted") res.inserted++;
    else if (result === "unchanged") res.skipped++;
    else res.updated++;
  }
}

/** Alamat export Globemerce diawali baris berisi nomor resi; buang baris itu. */
function cleanAddress(v: unknown, awb: string | null): string | null {
  const s = clean(v);
  if (!s) return null;
  const lines = s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length > 1 && awb && normalizeAwb(lines[0]) === awb) lines.shift();
  return lines.join(", ");
}

async function existingUpdates(tx: Tx, awbs: string[]) {
  const seen = new Set<string>();
  if (!awbs.length) return seen;
  const rows = await tx
    .select({ awb: schema.shipmentUpdates.awb, statusRaw: schema.shipmentUpdates.statusRaw })
    .from(schema.shipmentUpdates)
    .where(inArray(schema.shipmentUpdates.awb, awbs));
  for (const r of rows) seen.add(`${r.awb}|${r.statusRaw ?? ""}`);
  return seen;
}

async function importEverpro(tx: Tx, p: ImportPayload, rows: unknown[][], get: Getter, res: ImportResult, batchId: number, rawOf: (r: unknown[]) => object) {
  const parsed = rows.map((row) => ({ row, awb: normalizeAwb(get(row, "awb")) })).filter((x) => x.awb) as { row: unknown[]; awb: string }[];
  res.skipped += rows.length - parsed.length;
  const awbs = [...new Set(parsed.map((x) => x.awb))];
  const orders = awbs.length ? await tx.select().from(schema.orders).where(inArray(schema.orders.awb, awbs)) : [];
  const byAwb = new Map(orders.map((o) => [o.awb!, o]));
  const seen = await existingUpdates(tx, awbs);

  for (const { row, awb } of parsed) {
    const statusText = clean(get(row, "status")) ?? "";
    const returnedAt = parseDateTime(get(row, "returnedAt"));
    const status: ShipStatus | null = returnedAt ? "retur" : normalizeShipStatus(statusText);
    const failReason = clean(get(row, "failReason"));
    const statusRaw = [statusText, failReason && `alasan: ${failReason}`].filter(Boolean).join(" · ");
    const eventAt = returnedAt ?? parseDateTime(get(row, "deliveredAt")) ?? parseDateTime(get(row, "createdAt"));
    const isCod = /cod/i.test(String(get(row, "type") ?? ""));
    const codValue = parseIdr(get(row, "codValue"));

    if (status && !seen.has(`${awb}|${statusRaw}`)) {
      await tx.insert(schema.shipmentUpdates).values({ awb, status, statusRaw, eventAt, source: p.source, importBatchId: batchId, raw: rawOf(row) });
      seen.add(`${awb}|${statusRaw}`);
    }

    // COD yang sudah benar-benar cair.
    if (isCod && codValue > 0 && /berhasil|sukses|success|cair/i.test(String(get(row, "codStatus") ?? ""))) {
      const values = {
        awb,
        settlementDate: null,
        codAmount: codValue,
        shippingFee: parseIdr(get(row, "shippingCost")),
        codFee: parseIdr(get(row, "codFee")) + parseIdr(get(row, "codTax")),
        otherFee: 0,
        netAmount: parseIdr(get(row, "codDisbursement")),
        batchRef: "everpro-report",
        source: p.source,
        importBatchId: batchId,
        raw: rawOf(row),
      };
      await tx.insert(schema.codSettlements).values(values).onConflictDoUpdate({
        target: [schema.codSettlements.awb, schema.codSettlements.batchRef],
        set: { codAmount: values.codAmount, shippingFee: values.shippingFee, codFee: values.codFee, netAmount: values.netAmount, importBatchId: batchId, raw: values.raw },
      });
    }

    let order = byAwb.get(awb);
    const patch: Partial<typeof schema.orders.$inferInsert> = {};
    if (!order) {
      // Resi belum tercatat di order: cari lewat HP penerima + tanggal (order H-3 s/d hari resi dibuat).
      order = await matchByPhone(tx, normalizePhone(get(row, "receiverPhone")), parseDate(get(row, "createdAt")), parseIdr(get(row, "packagePrice")));
      if (!order) {
        res.unmatched++;
        continue;
      }
      patch.awb = awb;
      byAwb.set(awb, order);
    }
    if (status && status !== order.shipStatus && shouldUpdateStatus(order.shipStatus, status)) {
      Object.assign(patch, { shipStatus: status, shipStatusRaw: statusRaw, shipStatusAt: eventAt ?? new Date() });
      order.shipStatus = status;
    } else if (status === order.shipStatus && statusRaw !== order.shipStatusRaw) {
      patch.shipStatusRaw = statusRaw;
    }
    if (!order.courier && get(row, "courier")) patch.courier = clean(get(row, "courier"));
    if (!order.shippingCost && parseIdr(get(row, "shippingCost"))) patch.shippingCost = parseIdr(get(row, "shippingCost"));
    if (!order.paymentMethod && isCod) patch.paymentMethod = "COD";
    if (Object.keys(patch).length) {
      await tx.update(schema.orders).set({ ...patch, updatedAt: new Date() }).where(eq(schema.orders.id, order.id));
      res.updated++;
    } else res.skipped++;
  }
}

/** Order tanpa resi dengan HP sama, tanggal order 0–3 hari sebelum resi dibuat; harus satu-satunya kandidat. */
async function matchByPhone(tx: Tx, phone: string | null, created: string | null, price: number) {
  if (!phone || !created) return undefined;
  const from = new Date(Date.parse(created) - 3 * 86400000).toISOString().slice(0, 10);
  const rows = await tx
    .select()
    .from(schema.orders)
    .where(and(eq(schema.orders.customerPhone, phone), isNull(schema.orders.awb), between(schema.orders.orderDate, from, created)))
    .limit(3);
  const exact = price ? rows.filter((r) => r.omzet === price) : rows;
  if (exact.length === 1) return exact[0];
  return rows.length === 1 ? rows[0] : undefined;
}

async function importCustomers(tx: Tx, p: ImportPayload, rows: unknown[][], get: Getter, res: ImportResult) {
  const values = rows
    .map((row) => {
      const externalId = clean(get(row, "externalId"));
      const prefix = String(get(row, "phonePrefix") ?? "").replace(/\D/g, "");
      const raw = String(get(row, "phone") ?? "").replace(/\D/g, "");
      const phone = normalizePhone(prefix && raw && !raw.startsWith(prefix) && !raw.startsWith("0") ? prefix + raw : raw);
      if (!externalId || !phone) return null;
      return {
        source: p.source,
        externalId,
        name: clean(get(row, "name")),
        phone,
        province: clean(get(row, "province")),
        regency: clean(get(row, "regency")),
        district: clean(get(row, "district")),
        gender: clean(get(row, "gender")),
        totalOrder: Math.round(parseIdr(get(row, "totalOrder"))),
        lastOrderDate: parseDate(get(row, "lastOrderDate")),
        joinDate: parseDate(get(row, "joinDate")),
        productConsume: clean(get(row, "productConsume")),
        tags: clean(get(row, "tags")),
        customerSource: clean(get(row, "customerSource")),
        updatedAt: new Date(),
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  res.skipped += rows.length - values.length;

  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    const r = await tx
      .insert(schema.customers)
      .values(chunk)
      .onConflictDoUpdate({
        target: [schema.customers.source, schema.customers.externalId],
        set: Object.fromEntries(
          ["name", "phone", "province", "regency", "district", "gender", "total_order", "last_order_date", "join_date", "product_consume", "tags", "customer_source", "updated_at"]
            .map((c) => [c.replace(/_([a-z])/g, (_, x) => x.toUpperCase()), sql.raw(`excluded.${c}`)]),
        ),
      })
      .returning({ inserted: sql<boolean>`xmax = 0` });
    for (const x of r) x.inserted ? res.inserted++ : res.updated++;
  }
}

async function importShipments(tx: Tx, p: ImportPayload, rows: unknown[][], get: Getter, res: ImportResult, batchId: number, rawOf: (r: unknown[]) => object) {
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
  const seen = await existingUpdates(tx, awbs);

  for (const x of parsed) {
    const status = normalizeShipStatus(x.statusRaw);
    if (!status) {
      res.skipped++;
      res.errors.push(`Resi ${x.awb}: status "${x.statusRaw ?? ""}" tidak dikenali`);
      continue;
    }
    if (!seen.has(`${x.awb}|${x.statusRaw ?? ""}`)) {
      await tx.insert(schema.shipmentUpdates).values({ awb: x.awb!, status, statusRaw: x.statusRaw, eventAt: x.eventAt, source: p.source, importBatchId: batchId, raw: rawOf(x.row) });
      seen.add(`${x.awb}|${x.statusRaw ?? ""}`);
    }
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

async function importSettlements(tx: Tx, p: ImportPayload, rows: unknown[][], get: Getter, res: ImportResult, batchId: number, rawOf: (r: unknown[]) => object) {
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
      importBatchId: batchId,
      raw: rawOf(row),
    };
    await tx.insert(schema.codSettlements).values(values).onConflictDoUpdate({ target: [schema.codSettlements.awb, schema.codSettlements.batchRef], set: values });
    res.inserted++;
  }
  const awbs = [...new Set(rows.map((r) => normalizeAwb(get(r, "awb"))).filter(Boolean) as string[])];
  if (awbs.length) {
    const matched = await tx.select({ awb: schema.orders.awb }).from(schema.orders).where(inArray(schema.orders.awb, awbs));
    res.unmatched = awbs.length - new Set(matched.map((m) => m.awb)).size;
  }
}

export function normalizePayment(v: unknown): string | null {
  const s = clean(v)?.toUpperCase();
  if (!s) return null;
  if (/COD|BAYAR DI TEMPAT/.test(s)) return "COD";
  if (/TRANSFER|\bTF\b|BANK|\bVA\b|VIRTUAL/.test(s)) return "TF";
  if (/QR/.test(s)) return "QR";
  if (/\bCC\b|KARTU|CREDIT/.test(s)) return "CC";
  return s;
}
