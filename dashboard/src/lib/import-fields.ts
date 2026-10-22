/** Definisi kolom yang bisa diimpor + tebakan otomatis dari judul kolom file export. */

export type ImportKind = "orders" | "shipments" | "settlements";

export type FieldDef = { key: string; label: string; required?: boolean; hints: string[] };

export const IMPORT_KINDS: Record<ImportKind, { label: string; description: string; fields: FieldDef[] }> = {
  orders: {
    label: "Order (Globemerce / file lain)",
    description: "Export order dari Globemerce atau file lain. Order dengan ID/resi yang sama akan diperbarui, bukan diduplikasi.",
    fields: [
      { key: "externalId", label: "ID order (dari sistem asal)", hints: ["order id", "id order", "no order", "nomor order", "invoice", "order number", "kode order"] },
      { key: "orderDate", label: "Tanggal order", required: true, hints: ["tanggal order", "tgl order", "order date", "tanggal", "tgl", "created", "date"] },
      { key: "customerName", label: "Nama customer", hints: ["nama penerima", "nama customer", "nama pembeli", "customer name", "receiver", "penerima", "nama"] },
      { key: "customerPhone", label: "No. HP / WA", hints: ["no hp", "no wa", "nomor hp", "telepon", "phone", "whatsapp", "hp", "wa"] },
      { key: "address", label: "Alamat", hints: ["alamat lengkap", "alamat", "address"] },
      { key: "city", label: "Kota", hints: ["kota", "kabupaten", "city", "lokasi"] },
      { key: "productType", label: "Produk / paket", hints: ["nama produk", "produk", "product", "paket", "type", "item"] },
      { key: "paymentMethod", label: "Metode bayar", hints: ["metode pembayaran", "pembayaran", "payment", "metode bayar", "trx"] },
      { key: "category", label: "Kategori (O/F/R)", hints: ["kategori", "category", "hio", "tipe customer"] },
      { key: "omzet", label: "Total / omzet", required: true, hints: ["total pembayaran", "grand total", "total harga", "omzet", "total", "harga", "amount"] },
      { key: "csCode", label: "CS", hints: ["cs", "admin", "pic", "sales", "handled by"] },
      { key: "courier", label: "Ekspedisi", hints: ["ekspedisi", "kurir", "courier", "logistik", "jasa kirim"] },
      { key: "shippingCost", label: "Ongkir", hints: ["ongkir", "ongkos kirim", "shipping cost", "biaya kirim"] },
      { key: "awb", label: "No. resi", hints: ["no resi", "nomor resi", "resi", "awb", "tracking", "airwaybill"] },
      { key: "shipStatusRaw", label: "Status pengiriman", hints: ["status pengiriman", "status kirim", "status paket", "status"] },
      { key: "notes", label: "Catatan", hints: ["catatan", "note", "keterangan"] },
    ],
  },
  shipments: {
    label: "Status pengiriman (Everpro)",
    description: "Laporan pengiriman dari Everpro: memperbarui status resi pada order yang cocok.",
    fields: [
      { key: "awb", label: "No. resi", required: true, hints: ["no resi", "nomor resi", "resi", "awb", "tracking", "airwaybill"] },
      { key: "statusRaw", label: "Status", required: true, hints: ["status pengiriman", "status paket", "last status", "status terakhir", "status"] },
      { key: "eventAt", label: "Waktu status", hints: ["tanggal update", "update terakhir", "last update", "waktu", "tanggal status", "updated"] },
      { key: "courier", label: "Ekspedisi", hints: ["ekspedisi", "kurir", "courier", "logistik"] },
      { key: "shippingCost", label: "Ongkir", hints: ["ongkir", "ongkos kirim", "shipping cost", "biaya kirim"] },
    ],
  },
  settlements: {
    label: "Pencairan COD & ongkir (Everpro)",
    description: "Laporan pencairan dana COD dari Everpro, untuk dicocokkan dengan order COD.",
    fields: [
      { key: "awb", label: "No. resi", required: true, hints: ["no resi", "nomor resi", "resi", "awb", "tracking", "airwaybill"] },
      { key: "settlementDate", label: "Tanggal pencairan", hints: ["tanggal pencairan", "tgl pencairan", "tanggal cair", "settlement date", "tanggal transfer", "tanggal"] },
      { key: "codAmount", label: "Nilai COD", hints: ["nilai cod", "jumlah cod", "cod amount", "total cod", "harga barang", "cod"] },
      { key: "shippingFee", label: "Ongkir", hints: ["ongkos kirim", "ongkir", "shipping fee", "biaya kirim"] },
      { key: "codFee", label: "Biaya COD", hints: ["biaya cod", "fee cod", "cod fee", "biaya layanan cod", "admin cod"] },
      { key: "otherFee", label: "Biaya lain (asuransi, dll.)", hints: ["asuransi", "biaya lain", "other fee", "potongan"] },
      { key: "netAmount", label: "Dana dicairkan (net)", hints: ["dana dicairkan", "total pencairan", "jumlah diterima", "net amount", "dicairkan", "pencairan", "net"] },
      { key: "batchRef", label: "ID batch pencairan", hints: ["id pencairan", "no pencairan", "batch", "invoice", "id penarikan"] },
    ],
  },
};

const norm = (s: string) => s.toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Tebak kolom file untuk setiap field. Petunjuk yang lebih panjang (lebih spesifik) menang,
 * dan satu kolom hanya dipakai satu field ("biaya cod" tidak ikut terpakai sebagai "cod").
 */
export function guessMapping(kind: ImportKind, headers: string[]): Record<string, string> {
  const candidates: { field: string; header: string; score: number }[] = [];
  for (const f of IMPORT_KINDS[kind].fields) {
    for (const h of headers) {
      const nh = norm(h);
      for (const hint of f.hints) {
        const exact = nh === hint;
        if (exact || nh.includes(hint)) candidates.push({ field: f.key, header: h, score: hint.length + (exact ? 100 : 0) });
      }
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  for (const c of candidates) {
    if (mapping[c.field] || used.has(c.header)) continue;
    mapping[c.field] = c.header;
    used.add(c.header);
  }
  return mapping;
}

export function missingRequired(kind: ImportKind, mapping: Record<string, string>): string[] {
  return IMPORT_KINDS[kind].fields.filter((f) => f.required && !mapping[f.key]).map((f) => f.label);
}
