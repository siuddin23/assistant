const idr = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 0 });

export const rupiah = (v: number | null | undefined) => (v == null ? "-" : `Rp${idr.format(v)}`);
export const num = (v: number | null | undefined, d = 0) =>
  v == null ? "-" : new Intl.NumberFormat("id-ID", { maximumFractionDigits: d, minimumFractionDigits: d }).format(v);
export const pct = (v: number | null | undefined, d = 1) => (v == null ? "-" : `${num(v * 100, d)}%`);
export const ratio = (v: number | null | undefined) => (v == null ? "-" : `${num(v, 2)}x`);

/** Rp1,54 M / Rp63,0 jt / Rp585 rb */
export function rupiahShort(v: number | null | undefined) {
  if (v == null) return "-";
  const a = Math.abs(v);
  if (a >= 1e9) return `Rp${num(v / 1e9, 2)} M`;
  if (a >= 1e6) return `Rp${num(v / 1e6, 1)} jt`;
  if (a >= 1e4) return `Rp${num(v / 1e3, 0)} rb`;
  return rupiah(v);
}

const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export function tanggal(iso: string | null | undefined) {
  if (!iso) return "-";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** Tanggal hari ini di WIB, format yyyy-mm-dd. */
export function todayWib(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function monthRange(iso = todayWib()) {
  const [y, m] = iso.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${iso.slice(0, 7)}-01`, to: `${iso.slice(0, 7)}-${String(last).padStart(2, "0")}` };
}

export function daysBetween(fromIso: string, toIso: string) {
  return Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86400000);
}
