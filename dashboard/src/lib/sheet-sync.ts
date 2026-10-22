import "server-only";
import { db, schema } from "@/db";
import { upsertOrder } from "./order-upsert";
import { fetchSheetTab, MONTH_TABS, parseSheetRows, sheetAwbKey, sheetRowKey } from "./sheet";

export type SyncStats = { tab: string; total: number; inserted: number; updated: number; unchanged: number; skipped: number; warnings: string[] };

/** Impor satu tab sheet (rows sudah diambil) ke database. Aman dijalankan berulang. */
export async function importSheetRows(tab: string, rows: unknown[][], userId?: number): Promise<SyncStats> {
  const parsed = parseSheetRows(tab, rows);
  const stats: SyncStats = { tab, total: parsed.orders.length, inserted: 0, updated: 0, unchanged: 0, skipped: parsed.skipped, warnings: parsed.warnings };
  const seenAwb = new Set<string>();

  await db.transaction(async (tx) => {
    for (const r of parsed.orders) {
      const keys = [sheetRowKey(tab, r.rowNumber)];
      // Resi yang muncul di lebih dari satu baris tidak bisa jadi kunci unik.
      if (r.awb && !seenAwb.has(r.awb)) keys.unshift(sheetAwbKey(r.awb));
      if (r.awb) seenAwb.add(r.awb);
      const { result } = await upsertOrder(tx, { order: r.order, items: r.items, keys });
      if (result === "inserted") stats.inserted++;
      else if (result === "unchanged") stats.unchanged++;
      else stats.updated++;
    }
    await tx.insert(schema.importBatches).values({
      kind: "sheet",
      source: `spreadsheet:${tab}`,
      totalRows: stats.total,
      inserted: stats.inserted,
      updated: stats.updated,
      skipped: stats.skipped + stats.unchanged,
      errors: stats.warnings.slice(0, 200),
      createdBy: userId,
    });
  });
  return stats;
}

/** Ambil tab dari Google Sheets lalu impor. Default: bulan ini dan bulan lalu. */
export async function syncSpreadsheet(tabs?: string[], userId?: number): Promise<SyncStats[]> {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  if (!spreadsheetId) throw new Error("SPREADSHEET_ID belum diisi");
  if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON belum diisi");
  const now = new Date(Date.now() + 7 * 3600 * 1000); // WIB
  const m = now.getUTCMonth();
  const targets = tabs?.length ? tabs : [MONTH_TABS[(m + 11) % 12], MONTH_TABS[m]];
  const out: SyncStats[] = [];
  for (const tab of targets) out.push(await importSheetRows(tab, await fetchSheetTab(spreadsheetId, tab), userId));
  return out;
}
