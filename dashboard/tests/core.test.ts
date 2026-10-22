import { describe, expect, it } from "vitest";
import { normalizePhone, parseDate, parseDateTime, parseIdr } from "@/lib/parse";
import { normalizeShipStatus, shouldUpdateStatus } from "@/lib/shipping";
import { parseSheetRows } from "@/lib/sheet";
import { guessMapping, missingRequired } from "@/lib/import-fields";
import { classify, summarize, type ReconRow } from "@/lib/reconcile";
import { getPath, listPaths } from "@/lib/globemerce-paths";

describe("parse", () => {
  it("angka format Indonesia & US", () => {
    expect(parseIdr("1.989.000")).toBe(1989000);
    expect(parseIdr("Rp32.500")).toBe(32500);
    expect(parseIdr("1,989,000.50")).toBe(1989000.5);
    expect(parseIdr("29,9")).toBe(29.9);
    expect(parseIdr(150000)).toBe(150000);
    expect(parseIdr("#N/A")).toBe(0);
  });
  it("tanggal", () => {
    expect(parseDate("01/10/2026")).toBe("2026-10-01");
    expect(parseDate("2026-10-05")).toBe("2026-10-05");
    expect(parseDate("05 Oktober 2026 17:36 WIB")).toBe("2026-10-05");
    expect(parseDate(46296)).toBe("2026-10-01"); // serial Excel
    expect(parseDate("")).toBeNull();
    expect(parseDateTime("05 Oktober 2026 17:36 WIB")?.toISOString()).toBe("2026-10-05T10:36:00.000Z");
  });
  it("nomor HP", () => {
    expect(normalizePhone("853-7623-5144")).toBe("6285376235144");
    expect(normalizePhone("0812 9339 2951")).toBe("6281293392951");
    expect(normalizePhone("6281390005919")).toBe("6281390005919");
    expect(normalizePhone("123")).toBeNull();
  });
});

describe("status pengiriman", () => {
  it.each([
    ["Terkirim", "terkirim"],
    ["Sedang Diantar", "dalam_perjalanan"],
    ["Dikirim ke Penerima", "dalam_perjalanan"],
    ["Sampai Kota Tujuan", "dalam_perjalanan"],
    ["Gagal Kirim", "gagal"],
    ["Sedang Dikembalikan", "retur"],
    ["Dikirim Ulang", "dalam_perjalanan"],
    ["DELIVERED", "terkirim"],
    ["RTS", "retur"],
  ])("%s -> %s", (raw, expected) => expect(normalizeShipStatus(raw)).toBe(expected));
  it("tidak mundur dari status final", () => {
    expect(shouldUpdateStatus("terkirim", "dalam_perjalanan")).toBe(false);
    expect(shouldUpdateStatus("gagal", "terkirim")).toBe(true);
    expect(shouldUpdateStatus("dalam_perjalanan", "retur")).toBe(true);
  });
});

function sheetRow(over: Record<string, string>) {
  const row = Array(36).fill("");
  const set = (col: string, v: string) => {
    let n = 0;
    for (const ch of col) n = n * 26 + ch.charCodeAt(0) - 64;
    row[n - 1] = v;
  };
  for (const [k, v] of Object.entries(over)) set(k, v);
  return row;
}

describe("sheet", () => {
  const header = [["judul"], ["pic", "Tanggal"], ["rekap"], ["rekap"]];
  it("membaca baris order", () => {
    const rows = [
      ...header,
      sheetRow({ A: "FTRH", B: "01/10/2026", D: "Meliyana", E: "FB", F: "TF", G: "Bekasi", I: "82288888382", J: "1", L: "1", Z: "1.989.000", AB: "R", AD: "Lion Parcel", AE: "Rp9.000", AG: "C2QXFIUF", AH: "Terkirim", AI: "02 Oktober 2026 11:42 WIB" }),
      sheetRow({ A: "RS", B: "01/10/2026", D: "X", E: "DVN", F: "COD", Y: "999.000", AB: "" }),
      sheetRow({ A: "RS", B: "", Y: "999.000" }),
    ];
    const r = parseSheetRows("OKTOBER", rows);
    expect(r.orders).toHaveLength(2);
    const a = r.orders[0];
    expect(a.rowNumber).toBe(5);
    expect(a.order).toMatchObject({ csCode: "FTRH", omzet: 1989000, category: "R", paymentMethod: "TF", awb: "C2QXFIUF", shipStatus: "terkirim", shippingCost: 9000, customerPhone: "6282288888382" });
    expect(a.items).toEqual([{ productCode: "DVN", qty: 1 }, { productCode: "SGLOW", qty: 1 }]);
    expect(r.orders[1].order.category).toBe("O"); // ditebak dari kolom omzet O
    expect(r.orders[1].order.shipStatus).toBe("belum_kirim");
    expect(r.skipped).toBe(1);
    expect(r.warnings.length).toBe(2);
  });
});

describe("impor file", () => {
  it("menebak kolom laporan Everpro tanpa bentrok", () => {
    const m = guessMapping("settlements", ["No Resi", "Tanggal Pencairan", "Nilai COD", "Biaya COD", "Ongkos Kirim", "Dana Dicairkan"]);
    expect(m).toEqual({ awb: "No Resi", settlementDate: "Tanggal Pencairan", codAmount: "Nilai COD", codFee: "Biaya COD", shippingFee: "Ongkos Kirim", netAmount: "Dana Dicairkan" });
    expect(missingRequired("settlements", m)).toEqual([]);
  });
  it("kolom wajib", () => {
    expect(missingRequired("orders", guessMapping("orders", ["Nama", "Alamat"]))).toEqual(["Tanggal order", "Total / omzet"]);
  });
});

describe("rekonsiliasi", () => {
  const base: ReconRow = { orderId: 1, orderDate: "2026-10-01", awb: "A1", customerName: "x", csCode: "RS", omzet: 999000, shipStatus: "terkirim", shippingCost: 20000, settledCod: null, settledShipping: null, settledFees: null, settledNet: null, settlementDate: null };
  it("klasifikasi", () => {
    expect(classify(base).status).toBe("belum_cair");
    expect(classify({ ...base, settledCod: 999000, settledShipping: 22000 })).toEqual({ status: "sesuai", codDiff: 0, shippingDiff: 2000 });
    expect(classify({ ...base, settledCod: 900000 }).status).toBe("selisih");
    expect(classify({ ...base, shipStatus: "retur" }).status).toBe("retur");
    expect(classify({ ...base, awb: null, shipStatus: "belum_kirim" }).status).toBe("tanpa_resi");
  });
  it("ringkasan tidak menghitung retur sebagai COD seharusnya", () => {
    const s = summarize([base, { ...base, orderId: 2, shipStatus: "retur" }]);
    expect(s.expected).toBe(999000);
    expect(s.by.belum_cair.count).toBe(1);
  });
});

describe("payload webhook", () => {
  const payload = { event: "order.created", data: { id: "GM-1", customer: { name: "A", phone: "0812" }, items: [{ sku: "DVN" }] } };
  it("ambil nilai dari path", () => {
    expect(getPath(payload, "data.customer.name")).toBe("A");
    expect(getPath(payload, "data.items[0].sku")).toBe("DVN");
    expect(getPath(payload, "data.missing.x")).toBeUndefined();
  });
  it("daftar path daun", () => {
    expect(listPaths(payload).map((p) => p.path)).toEqual(["event", "data.id", "data.customer.name", "data.customer.phone", "data.items[0].sku"]);
  });
});
