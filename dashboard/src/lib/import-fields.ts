/** Definisi kolom yang bisa diimpor + tebakan otomatis dari judul kolom file export. */

export type ImportKind = "orders" | "everpro_orders" | "customers" | "sheet" | "shipments" | "settlements";

export type FieldDef = { key: string; label: string; required?: boolean; hints: string[] };

export type KindDef = { label: string; description: string; sources: string[]; fields: FieldDef[] };

// Petunjuk ditulis dalam bentuk ternormalisasi: huruf kecil, "_" "-" "." "/" jadi spasi.
export const IMPORT_KINDS: Record<ImportKind, KindDef> = {
  orders: {
    label: "Order Globemerce (order list)",
    description:
      "Export \"order list\" dari Globemerce. Order dicocokkan dengan order dari spreadsheet lewat resi; kolom yang kosong (mis. HPP) diisi, data sheet tidak ditimpa.",
    sources: ["globemerce", "lainnya"],
    fields: [
      { key: "externalId", label: "ID order", hints: ["o id", "order id", "id order", "no order", "nomor order", "order number", "kode order"] },
      { key: "orderDate", label: "Tanggal order", required: true, hints: ["created", "tanggal order", "tgl order", "order date", "tanggal", "tgl", "date"] },
      { key: "customerName", label: "Nama customer", hints: ["receiver name", "nama penerima", "nama customer", "nama pembeli", "customer name", "penerima", "nama"] },
      { key: "customerPhone", label: "No. HP / WA", hints: ["receiver mobile", "no hp", "no wa", "nomor hp", "telepon", "phone", "whatsapp"] },
      { key: "address", label: "Alamat", hints: ["receiver address", "alamat lengkap", "alamat", "address"] },
      { key: "city", label: "Kota / kabupaten", hints: ["receiver regency", "receiver city", "kabupaten", "kota", "city"] },
      { key: "productType", label: "Produk (isi paket)", hints: ["product quantity", "nama produk", "produk", "product", "paket", "item"] },
      { key: "omzet", label: "Total / omzet", required: true, hints: ["total price", "total pembayaran", "grand total", "total harga", "omzet", "total", "amount"] },
      { key: "productCost", label: "HPP / modal produk", hints: ["total product cost", "product cost", "hpp", "modal"] },
      { key: "isRepeat", label: "Repeat order? (1/0)", hints: ["is repeating", "repeat order", "repeat"] },
      { key: "orderStatus", label: "Status order (Completed/Cancelled)", hints: ["status", "order status", "status pesanan"] },
      { key: "paymentMethod", label: "Metode bayar", hints: ["payment type", "metode pembayaran", "pembayaran", "metode bayar"] },
      { key: "category", label: "Kategori (O/F/R)", hints: ["kategori", "category", "hio"] },
      { key: "csCode", label: "CS", hints: ["handled by cs", "kode cs"] },
      { key: "courier", label: "Ekspedisi", hints: ["shipment courier name", "courier name", "ekspedisi", "kurir", "courier"] },
      { key: "shippingCost", label: "Ongkir", hints: ["courier charges", "ongkir", "ongkos kirim", "shipping cost", "biaya kirim"] },
      { key: "awb", label: "No. resi", hints: ["tracking code", "no resi", "nomor resi", "resi", "awb", "airwaybill"] },
      { key: "shipStatusRaw", label: "Status pengiriman", hints: ["status pengiriman", "status kirim", "status paket"] },
      { key: "notes", label: "Catatan", hints: ["remark", "catatan", "note", "keterangan"] },
    ],
  },
  everpro_orders: {
    label: "Laporan order Everpro (status kirim + COD)",
    description:
      "Export \"order report\" dari Everpro. Memperbarui status pengiriman per resi, mencatat alasan gagal kirim, dan mencatat COD yang sudah cair (Status Pencairan COD = Berhasil).",
    sources: ["everpro"],
    fields: [
      { key: "awb", label: "No. resi (AWB)", required: true, hints: ["awb no", "no resi", "nomor resi", "awb", "resi"] },
      { key: "status", label: "Status", required: true, hints: ["status"] },
      { key: "createdAt", label: "Tanggal dibuat", hints: ["created date"] },
      { key: "deliveredAt", label: "Tanggal terkirim", hints: ["delivered date"] },
      { key: "returnedAt", label: "Tanggal retur", hints: ["returned date"] },
      { key: "returnAwb", label: "Resi retur", hints: ["resi retur"] },
      { key: "courier", label: "Ekspedisi", hints: ["courier"] },
      { key: "type", label: "Tipe (COD / non-COD)", hints: ["type"] },
      { key: "shippingCost", label: "Ongkir", hints: ["shipping price"] },
      { key: "codValue", label: "Nilai COD", hints: ["cod value"] },
      { key: "codFee", label: "Biaya COD", hints: ["cod fee"] },
      { key: "codTax", label: "Pajak biaya COD", hints: ["tax cod fee"] },
      { key: "codDisbursement", label: "Dana COD dicairkan", hints: ["cod disbursement"] },
      { key: "codStatus", label: "Status pencairan COD", hints: ["status pencairan cod"] },
      { key: "failReason", label: "Alasan gagal kirim", hints: ["alasan gagal kirim 1"] },
      { key: "lastTracking", label: "Tracking terakhir", hints: ["last tracking status"] },
      { key: "receiverPhone", label: "HP penerima (untuk mencocokkan order tanpa resi)", hints: ["receiver phone"] },
      { key: "packagePrice", label: "Harga paket", hints: ["package price"] },
    ],
  },
  customers: {
    label: "Daftar customer Globemerce",
    description: "Export \"Customer List\" dari Globemerce: total order & tanggal order terakhir, untuk follow up repeat order.",
    sources: ["globemerce"],
    fields: [
      { key: "externalId", label: "ID customer", required: true, hints: ["id (do not edit! leave empty if new customer)", "customer id", "id"] },
      { key: "name", label: "Nama", hints: ["full name (required)", "full name", "nama"] },
      { key: "phonePrefix", label: "Kode negara HP", hints: ["contact prefix (required)", "contact prefix"] },
      { key: "phone", label: "No. HP", required: true, hints: ["contact (required)", "contact", "phone", "no hp"] },
      { key: "province", label: "Provinsi", hints: ["province", "provinsi"] },
      { key: "regency", label: "Kota / kabupaten", hints: ["regency", "kabupaten", "kota"] },
      { key: "district", label: "Kecamatan", hints: ["district", "kecamatan"] },
      { key: "gender", label: "Gender", hints: ["gender"] },
      { key: "totalOrder", label: "Total order", hints: ["total order"] },
      { key: "lastOrderDate", label: "Order terakhir", hints: ["last completed date"] },
      { key: "joinDate", label: "Tanggal bergabung", hints: ["join date"] },
      { key: "productConsume", label: "Produk yang dipakai", hints: ["product consume"] },
      { key: "tags", label: "Tag", hints: ["system tag", "tag"] },
      { key: "customerSource", label: "Sumber customer", hints: ["customer source"] },
    ],
  },
  sheet: {
    label: "Spreadsheet DATABASE HARYS (1 tab bulanan)",
    description:
      "Alternatif sinkron otomatis: download satu tab bulanan (File → Download → .xlsx atau .csv), lalu upload di sini. Format kolom sudah dikenali, tidak perlu pemetaan.",
    sources: ["sheet"],
    fields: [],
  },
  shipments: {
    label: "Status pengiriman (format lain)",
    description: "File status resi dari ekspedisi/aggregator lain.",
    sources: ["lainnya"],
    fields: [
      { key: "awb", label: "No. resi", required: true, hints: ["no resi", "nomor resi", "resi", "awb", "tracking"] },
      { key: "statusRaw", label: "Status", required: true, hints: ["status pengiriman", "status paket", "last status", "status terakhir", "status"] },
      { key: "eventAt", label: "Waktu status", hints: ["tanggal update", "update terakhir", "last update", "waktu", "tanggal status", "updated"] },
      { key: "courier", label: "Ekspedisi", hints: ["ekspedisi", "kurir", "courier", "logistik"] },
      { key: "shippingCost", label: "Ongkir", hints: ["ongkir", "ongkos kirim", "shipping cost", "biaya kirim"] },
    ],
  },
  settlements: {
    label: "Pencairan COD (format lain)",
    description: "Laporan pencairan COD per resi dari aggregator lain.",
    sources: ["lainnya"],
    fields: [
      { key: "awb", label: "No. resi", required: true, hints: ["no resi", "nomor resi", "resi", "awb", "tracking"] },
      { key: "settlementDate", label: "Tanggal pencairan", hints: ["tanggal pencairan", "tgl pencairan", "tanggal cair", "settlement date", "tanggal transfer", "tanggal"] },
      { key: "codAmount", label: "Nilai COD", hints: ["nilai cod", "jumlah cod", "cod amount", "total cod", "cod value", "cod"] },
      { key: "shippingFee", label: "Ongkir", hints: ["ongkos kirim", "ongkir", "shipping fee", "biaya kirim"] },
      { key: "codFee", label: "Biaya COD", hints: ["biaya cod", "fee cod", "cod fee", "biaya layanan cod", "admin cod"] },
      { key: "otherFee", label: "Biaya lain (asuransi, dll.)", hints: ["asuransi", "biaya lain", "other fee", "potongan"] },
      { key: "netAmount", label: "Dana dicairkan (net)", hints: ["dana dicairkan", "total pencairan", "jumlah diterima", "net amount", "dicairkan", "pencairan", "net"] },
      { key: "batchRef", label: "ID batch pencairan", hints: ["id pencairan", "no pencairan", "batch", "invoice", "id penarikan"] },
    ],
  },
};

export const normHeader = (s: string) => s.toLowerCase().replace(/[_\-./]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Tebak kolom file untuk setiap field. Kecocokan persis menang, lalu petunjuk yang lebih panjang
 * (lebih spesifik); satu kolom hanya dipakai satu field ("tax cod fee" tidak ikut terpakai sebagai "cod fee").
 */
export function guessMapping(kind: ImportKind, headers: string[], sample: unknown[][] = []): Record<string, string> {
  // Kolom yang kosong di semua baris contoh tidak ikut ditebak (mis. "created_at" kosong di export Globemerce).
  const filled = (i: number) => !sample.length || sample.some((r) => r[i] != null && String(r[i]).trim() !== "");
  const candidates: { field: string; header: string; score: number }[] = [];
  for (const f of IMPORT_KINDS[kind].fields) {
    for (const [hi, h] of headers.entries()) {
      if (!filled(hi)) continue;
      const nh = normHeader(h);
      for (const hint of f.hints) {
        const exact = nh === hint;
        // Petunjuk pendek (≤ 3 huruf) hanya boleh cocok persis atau sebagai kata utuh.
        const partial = hint.length > 3 ? nh.includes(hint) : new RegExp(`(^| )${hint}( |$)`).test(nh);
        if (exact || partial) candidates.push({ field: f.key, header: h, score: hint.length + (exact ? 100 : 0) });
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
