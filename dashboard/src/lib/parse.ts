/** Parsing nilai dari spreadsheet / file export (format Indonesia). */

export function colIndex(letter: string): number {
  let n = 0;
  for (const ch of letter.trim().toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/**
 * Angka dari sheet/export: "Rp1.989.000" -> 1989000, "29,9" -> 29.9, "990000.000000" -> 990000,
 * "1,989,000.50" -> 1989000.5. "" / "#N/A" -> 0. Angka asli dibiarkan.
 */
export function parseIdr(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null) return 0;
  let s = String(v).replace(/[^0-9,.\-]/g, "");
  if (!s || !/\d/.test(s)) return 0;
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;
  if (dots && commas) {
    // Pemisah yang muncul terakhir adalah desimal.
    s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (dots) {
    // Satu titik dengan bukan-3 digit di belakangnya = desimal ("990000.000000"); selain itu pemisah ribuan.
    const after = s.length - s.lastIndexOf(".") - 1;
    if (dots > 1 || after === 3) s = s.replace(/\./g, "");
  } else if (commas) {
    s = commas > 1 ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** Terima dd/mm/yyyy, dd-mm-yyyy, yyyy-mm-dd, Date, atau serial Excel. Hasil "yyyy-mm-dd". */
export function parseDate(v: unknown): string | null {
  if (v == null || v === "") return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return toIso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000)); // serial Excel -> UTC
    return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (m) return toIso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return toIso(+m[1], +m[2], +m[3]);
  // "05 Oktober 2026 17:36 WIB"
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const month = MONTHS.findIndex((x) => m![2].toLowerCase().startsWith(x));
    if (month >= 0) return toIso(+m[3], month + 1, +m[1]);
  }
  return null;
}

/** "05 Oktober 2026 17:36 WIB" -> Date (WIB). Untuk waktu status pengiriman. */
export function parseDateTime(v: unknown): Date | null {
  if (v instanceof Date) return v;
  const iso = parseDate(v);
  if (!iso) return null;
  const t = String(v).match(/(\d{1,2})[:.](\d{2})/);
  const time = t ? `${t[1].padStart(2, "0")}:${t[2]}` : "00:00";
  return new Date(`${iso}T${time}:00+07:00`);
}

const MONTHS = ["jan", "feb", "mar", "apr", "mei", "jun", "jul", "agu", "sep", "okt", "nov", "des"];

function toIso(y: number, m: number, d: number): string | null {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y > 2000)) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Normalisasi nomor HP ke format 628xxx (untuk pencarian & deduplikasi). */
export function normalizePhone(v: unknown): string | null {
  const digits = String(v ?? "").replace(/\D/g, "");
  if (digits.length < 8) return null;
  if (digits.startsWith("62")) return digits;
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("8")) return "62" + digits;
  return digits;
}

export function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s && s !== "#N/A" ? s : null;
}

export function normalizeAwb(v: unknown): string | null {
  const s = clean(v);
  return s ? s.replace(/\s+/g, "").toUpperCase() : null;
}

/**
 * "INDO DVN\V2 (1), INDO-SGLOW\V1 (2), COURIER CHARGES (1)" -> [{DVN,1},{SGLOW,2}]
 * Kode produk dicocokkan dari nama (huruf saja); item yang tidak dikenali diabaikan.
 */
export function parseItems(text: unknown, codes: string[]): { productCode: string; qty: number }[] {
  const out = new Map<string, number>();
  for (const part of String(text ?? "").split(",")) {
    const m = part.match(/^(.*?)\((\d+)\)\s*$/);
    const name = (m ? m[1] : part).toUpperCase().replace(/[^A-Z]/g, "");
    const qty = m ? Number(m[2]) : 1;
    const code = codes.find((c) => name.includes(c.toUpperCase().replace(/[^A-Z]/g, "")));
    if (code && qty > 0) out.set(code, (out.get(code) ?? 0) + qty);
  }
  return [...out].map(([productCode, qty]) => ({ productCode, qty }));
}
