# Glowlab Dashboard

Web app untuk admin dan tim: satu database order yang terhubung ke **spreadsheet DATABASE HARYS**, **Globemerce**, dan **Everpro**.

| Menu | Isi |
|---|---|
| **Dashboard** | Omzet (O/F/R), AOV, MER akuisisi, biaya per customer baru, gagal kirim/retur, COD belum cair, grafik harian, performa CS, produk |
| **Order** | Cari & filter order, input/edit order, export CSV |
| **Pengiriman** | Paket tertahan (> 5 hari), belum dikirim, gagal, retur |
| **Retur & gagal kirim** | Order gagal/retur yang belum ditindaklanjuti, catatan alasan, status, dan biaya retur |
| **Rekonsiliasi COD** | Cocokkan nilai COD & ongkir per resi dengan laporan pencairan Everpro |
| **Impor file** | Upload export Globemerce/Everpro (.xlsx/.csv). Kolom dikenali otomatis dan bisa disesuaikan |
| **Integrasi** | Sinkron spreadsheet, URL & pemetaan webhook Globemerce, status data spend Meta |
| **Pengaturan** | User & role, daftar CS, daftar produk |

**Role**: *admin* (semua menu), *cs* (order, pengiriman, retur), *viewer* (lihat saja, termasuk rekonsiliasi).

## Cara data masuk

```
Spreadsheet (tab per bulan) ──sinkron tiap jam──┐
Globemerce ──webhook (real-time) / export file──┤
Everpro ──export status kirim & pencairan COD───┼──> PostgreSQL ──> Dashboard
Meta Ads ──job laporan harian (Python)──────────┤
Input manual admin/CS ──────────────────────────┘
```

- **Tanpa duplikat.** Sinkron dan impor aman diulang. Order dari sumber berbeda digabung otomatis bila resinya sama, atau bila no. HP, tanggal, dan omzetnya sama.
- **Edit di dashboard menang.** Order yang sudah diedit di dashboard tidak ditimpa sinkron sheet; hanya status pengirimannya yang tetap diperbarui.
- **Data customer** (nama, alamat, HP) hanya bisa dilihat oleh user yang login.

## Deploy (sekali saja, ±30 menit)

### 1. Database — Supabase (gratis)
1. Buat project di [supabase.com](https://supabase.com) dan pilih region Singapore.
2. Buka **Connect → Transaction pooler** dan salin connection string-nya. Ini menjadi `DATABASE_URL`.

### 2. Hosting — Vercel
1. Di [vercel.com](https://vercel.com), import repo GitHub ini dan set **Root Directory** ke `dashboard`.
2. Isi Environment Variables berikut (lihat `.env.example`):

| Variabel | Isi |
|---|---|
| `DATABASE_URL` | dari Supabase |
| `SESSION_SECRET` | string acak ≥ 32 karakter (`openssl rand -base64 48`) |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON service account (sama dengan job laporan harian) |
| `SPREADSHEET_ID` | `16Mla00sapW6GKX60kb5Wmaq6zaFDLHxISWxGT5pfy-0` |
| `GLOBEMERCE_WEBHOOK_TOKEN` | string acak, menjadi bagian URL webhook |
| `INGEST_TOKEN` | string acak, dipakai job Python untuk mengirim spend Meta |
| `CRON_SECRET` | string acak, untuk sinkron sheet terjadwal |

3. Deploy.

### 3. Siapkan database & user admin
Jalankan sekali dari komputer Anda, dengan `DATABASE_URL` dari Supabase:

```bash
cd dashboard
npm install
export DATABASE_URL="postgres://…"        # dari Supabase
npm run db:migrate                         # buat tabel + data CS & produk awal
npm run create-user -- email@anda.com "Nama Anda" passwordKuat admin
```

User lain (CS, viewer) bisa ditambahkan dari menu **Pengaturan**.

### 4. Hubungkan sumber data
1. **Spreadsheet**: share sheet ke email service account (Viewer). Lalu buka **Integrasi → Sinkron sekarang** dan centang semua bulan untuk impor pertama.
2. **Sinkron otomatis tiap jam**: di GitHub repo → Settings → Secrets → Actions, isi `DASHBOARD_URL` (URL Vercel, mis. `https://glowlab.vercel.app`) dan `CRON_SECRET`. Workflow *Sinkron spreadsheet ke dashboard* akan jalan tiap jam.
3. **Globemerce**: salin URL webhook dari menu **Integrasi** ke pengaturan webhook Globemerce. Setelah order pertama masuk, petakan field-nya di halaman yang sama (sekali saja). Export file dari Globemerce juga bisa di-upload lewat **Impor file**.
4. **Everpro**: download laporan pengiriman dan laporan pencairan COD, lalu upload di **Impor file**. Centang "Ingat pemetaan kolom" supaya impor berikutnya cukup pilih file.
5. **Spend Meta Ads**: isi secret `DASHBOARD_URL` dan `INGEST_TOKEN` di GitHub. Job laporan harian akan mengirim spend ke dashboard setiap pagi.

## Pengembangan lokal

```bash
cd dashboard
cp .env.example .env.local    # isi DATABASE_URL lokal & SESSION_SECRET
npm install
npm run db:migrate
npm run create-user -- admin@lokal.test "Admin" password123 admin
npm run dev                   # http://localhost:3000
npm test                      # unit test
npm run lint                  # typecheck
```

Perubahan skema: edit `src/db/schema.ts`, jalankan `npm run db:generate`, lalu `npm run db:migrate`.

Stack: Next.js 15 (App Router) · PostgreSQL + Drizzle ORM · Tailwind CSS · Recharts.
