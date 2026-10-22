/**
 * Sinkronisasi dari spreadsheet "DATABASE HARYS" (satu tab per bulan: JANUARI … DESEMBER).
 * Baris 1–4 = judul/header/rekap, data mulai baris 5.
 */
import { clean, colIndex, normalizeAwb, normalizePhone, parseDate, parseDateTime, parseIdr } from "./parse";
import { normalizeShipStatus } from "./shipping";
import type { NewOrder, ShipStatus } from "@/db/schema";

export const MONTH_TABS = [
  "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
  "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
];

export const FIRST_DATA_ROW = 5;

export const SHEET_COLUMNS = {
  cs: "A",
  date: "B",
  customerName: "D",
  productType: "E",
  payment: "F",
  city: "G",
  address: "H",
  phone: "I",
  omzetF: "X",
  omzetO: "Y",
  omzetR: "Z",
  category: "AB",
  notes: "AC",
  courier: "AD",
  shippingCost: "AE",
  insurance: "AF",
  awb: "AG",
  status: "AH",
  statusTime: "AI",
} as const;

// Kolom qty per produk (kolom sebelahnya berisi rekap harian, diabaikan).
export const PRODUCT_COLUMNS: Record<string, string> = {
  DVN: "J",
  SGLOW: "L",
  NOVIA: "N",
  EROJAN: "P",
  COFFIY: "R",
  BLZ: "T",
  EVN: "V",
};

export type SheetOrder = {
  rowNumber: number;
  order: Omit<NewOrder, "sourceRef">;
  items: { productCode: string; qty: number }[];
  awb: string | null;
};

export type SheetParseResult = { orders: SheetOrder[]; skipped: number; warnings: string[] };

const cell = (row: unknown[], letter: string) => {
  const v = row[colIndex(letter)];
  return v == null ? "" : String(v).trim();
};

export function parseSheetRows(tab: string, rows: unknown[][]): SheetParseResult {
  const out: SheetOrder[] = [];
  const warnings: string[] = [];
  let skipped = 0;
  const C = SHEET_COLUMNS;

  rows.forEach((row, i) => {
    const rowNumber = i + 1;
    if (rowNumber < FIRST_DATA_ROW || !row.some((c) => String(c ?? "").trim())) return;

    const omzetF = parseIdr(cell(row, C.omzetF));
    const omzetO = parseIdr(cell(row, C.omzetO));
    const omzetR = parseIdr(cell(row, C.omzetR));
    const omzet = omzetF + omzetO + omzetR;
    const orderDate = parseDate(cell(row, C.date));
    if (!orderDate) {
      if (omzet) warnings.push(`${tab} baris ${rowNumber}: ada omzet tapi tanggal kosong`);
      skipped++;
      return;
    }

    let category = cell(row, C.category).toUpperCase() as "O" | "F" | "R" | "";
    if (!["O", "F", "R"].includes(category)) {
      // Kategori kosong: tebak dari kolom omzet yang terisi.
      category = omzetO ? "O" : omzetF ? "F" : omzetR ? "R" : "";
      if (omzet) warnings.push(`${tab} baris ${rowNumber}: kategori F/O/R kosong, ditebak "${category}"`);
    }

    const rawStatus = clean(cell(row, C.status));
    const awb = normalizeAwb(cell(row, C.awb));
    const shipStatus: ShipStatus = normalizeShipStatus(rawStatus) ?? (awb ? "dalam_perjalanan" : "belum_kirim");

    const items = Object.entries(PRODUCT_COLUMNS)
      .map(([productCode, col]) => ({ productCode, qty: Math.round(parseIdr(cell(row, col))) }))
      .filter((x) => x.qty > 0);

    out.push({
      rowNumber,
      awb,
      items,
      order: {
        orderDate,
        csCode: clean(cell(row, C.cs))?.toUpperCase() ?? null,
        customerName: clean(cell(row, C.customerName)),
        customerPhone: normalizePhone(cell(row, C.phone)),
        address: clean(cell(row, C.address)),
        city: clean(cell(row, C.city)),
        productType: clean(cell(row, C.productType))?.toUpperCase() ?? null,
        paymentMethod: clean(cell(row, C.payment))?.toUpperCase() ?? null,
        category: category || null,
        omzet,
        courier: clean(cell(row, C.courier)),
        shippingCost: parseIdr(cell(row, C.shippingCost)) || null,
        insurance: parseIdr(cell(row, C.insurance)) || null,
        awb,
        shipStatus,
        shipStatusRaw: rawStatus,
        shipStatusAt: parseDateTime(cell(row, C.statusTime)),
        notes: clean(cell(row, C.notes)),
        source: "sheet",
      },
    });
  });

  return { orders: out, skipped, warnings };
}

/** Kunci baris sheet. AWB dipakai bila ada & unik, supaya baris yang bergeser tetap cocok. */
export function sheetRowKey(tab: string, rowNumber: number) {
  return `sheet:${tab}:${rowNumber}`;
}

export function sheetAwbKey(awb: string) {
  return `sheet:awb:${awb}`;
}

/** Ambil nilai tab sheet lewat Google Sheets API dengan service account. */
export async function fetchSheetTab(spreadsheetId: string, tab: string): Promise<unknown[][]> {
  const { GoogleAuth } = await import("google-auth-library");
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || "{}");
  const auth = new GoogleAuth({ credentials, scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"] });
  const client = await auth.getClient();
  const range = encodeURIComponent(`${tab}!A1:AQ`);
  const res = await client.request<{ values?: unknown[][] }>({
    url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}`,
  });
  return res.data.values ?? [];
}
