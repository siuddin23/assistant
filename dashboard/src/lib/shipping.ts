import type { ShipStatus } from "@/db/schema";

export const SHIP_STATUS_LABEL: Record<ShipStatus, string> = {
  belum_kirim: "Belum dikirim",
  dalam_perjalanan: "Dalam perjalanan",
  terkirim: "Terkirim",
  gagal: "Gagal kirim",
  retur: "Retur",
  batal: "Batal",
};

// Urutan penting: aturan yang lebih spesifik dicek dulu.
const RULES: [RegExp, ShipStatus][] = [
  [/batal|cancel/i, "batal"],
  [/dikembalikan|retur|return|rts|kembali ke (pengirim|penjual)/i, "retur"],
  [/gagal|failed|undeliver|ditolak|reject/i, "gagal"],
  [/terkirim|delivered|diterima|selesai|sukses|success/i, "terkirim"],
  [/diantar|dikirim|transit|perjalanan|pickup|dijemput|sampai|menunggu|manifest|shipped|on ?process|dalam proses|kirim ulang/i, "dalam_perjalanan"],
];

/** Petakan teks status dari ekspedisi / Everpro / sheet ke status baku. */
export function normalizeShipStatus(raw: string | null | undefined): ShipStatus | null {
  const s = (raw ?? "").trim();
  if (!s || s === "#N/A") return null;
  for (const [re, status] of RULES) if (re.test(s)) return status;
  return null;
}

/** Status final tidak boleh ditimpa oleh status yang lebih "awal" dari sumber lain. */
const RANK: Record<ShipStatus, number> = {
  belum_kirim: 0,
  dalam_perjalanan: 1,
  gagal: 2,
  terkirim: 3,
  retur: 4,
  batal: 4,
};

export function shouldUpdateStatus(current: ShipStatus, next: ShipStatus): boolean {
  // "gagal" bisa berlanjut ke "terkirim" (kirim ulang) atau "retur"; selain itu jangan mundur.
  return RANK[next] >= RANK[current] || current === "gagal";
}
