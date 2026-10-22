/** Logika rekonsiliasi COD (murni, tanpa DB, supaya mudah dites). */

export type ReconRow = {
  orderId: number;
  orderDate: string;
  awb: string | null;
  customerName: string | null;
  csCode: string | null;
  omzet: number;
  shipStatus: string;
  shippingCost: number | null;
  settledCod: number | null;
  settledShipping: number | null;
  settledFees: number | null;
  settledNet: number | null;
  settlementDate: string | null;
};

export type ReconStatus = "sesuai" | "selisih" | "belum_cair" | "dalam_proses" | "retur" | "tanpa_resi";

export const RECON_LABEL: Record<ReconStatus, string> = {
  sesuai: "Cair sesuai",
  selisih: "Cair, ada selisih",
  belum_cair: "Terkirim, belum cair",
  dalam_proses: "Masih dikirim",
  retur: "Gagal / retur",
  tanpa_resi: "Belum ada resi",
};

export const TOLERANCE = 1000; // selisih pembulatan yang diabaikan (Rp)

export function classify(r: ReconRow): { status: ReconStatus; codDiff: number | null; shippingDiff: number | null } {
  const shippingDiff =
    r.settledShipping != null && r.shippingCost ? r.settledShipping - r.shippingCost : null;
  if (r.settledCod != null) {
    const codDiff = r.settledCod - r.omzet;
    return { status: Math.abs(codDiff) <= TOLERANCE ? "sesuai" : "selisih", codDiff, shippingDiff };
  }
  if (!r.awb) return { status: "tanpa_resi", codDiff: null, shippingDiff };
  if (r.shipStatus === "terkirim") return { status: "belum_cair", codDiff: null, shippingDiff };
  if (r.shipStatus === "retur" || r.shipStatus === "gagal" || r.shipStatus === "batal")
    return { status: "retur", codDiff: null, shippingDiff };
  return { status: "dalam_proses", codDiff: null, shippingDiff };
}

export function summarize(rows: ReconRow[]) {
  const by: Record<ReconStatus, { count: number; omzet: number }> = {
    sesuai: { count: 0, omzet: 0 },
    selisih: { count: 0, omzet: 0 },
    belum_cair: { count: 0, omzet: 0 },
    dalam_proses: { count: 0, omzet: 0 },
    retur: { count: 0, omzet: 0 },
    tanpa_resi: { count: 0, omzet: 0 },
  };
  let expected = 0, settledCod = 0, settledNet = 0, fees = 0, shippingDiff = 0, codDiff = 0;
  for (const r of rows) {
    const c = classify(r);
    by[c.status].count++;
    by[c.status].omzet += r.omzet;
    if (c.status !== "retur") expected += r.omzet;
    settledCod += r.settledCod ?? 0;
    settledNet += r.settledNet ?? 0;
    fees += (r.settledShipping ?? 0) + (r.settledFees ?? 0);
    shippingDiff += c.shippingDiff ?? 0;
    codDiff += c.codDiff ?? 0;
  }
  return { by, expected, settledCod, settledNet, fees, shippingDiff, codDiff };
}
