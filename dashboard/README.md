# Glowlab Dashboard

Web app untuk admin dan tim: satu database order yang terhubung ke **spreadsheet DATABASE HARYS**, **Globemerce**, dan **Everpro**.

| Menu | Isi |
|---|---|
| **Dashboard** | Omzet (O/F/R), AOV, MER akuisisi, biaya per customer baru, gagal kirim/retur, COD belum cair, grafik harian, performa CS, produk |
| **Order** | Cari & filter order, input/edit order, export CSV |
| **Pengiriman** | Paket tertahan (> 5 hari), belum dikirim, gagal, retur |
| **Retur & gagal kirim** | Order gagal/retur yang belum ditindaklanjuti, catatan alasan, status, dan biaya retur |
| **Rekonsiliasi COD** | Cocokkan nilai COD & ongkir per resi dengan laporan pencairan Everpro |
| **Customer** | 11 ribu+ customer Globemerce: repeat rate, dan daftar yang belum order lagi 30/60/90/180 hari (link WhatsApp) untuk follow up repeat order |
| **Impor file** | Upload export Globemerce/Everpro/sheet (.xlsx/.csv). Kolom dikenali otomatis dan bisa disesuaikan |
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

- **Tanpa duplikat.** Sinkron dan impor aman diulang. Order dari sumber berbeda digabung otomatis bila resinya sama, atau bila no. HP dan omzetnya sama dengan selisih tanggal maksimal 3 hari. Penggabungan hanya mengisi kolom yang kosong (mis. HPP dari Globemerce, resi dari Everpro); data spreadsheet tidak ditimpa.
- **Order batal** dari Globemerce disimpan terpisah dan tidak dihitung ke omzet.
- **Edit di dashboard menang.** Order yang sudah diedit di dashboard tidak ditimpa sinkron sheet; hanya status pengirimannya yang tetap diperbarui.
- **Data customer** (nama, alamat, HP) hanya bisa dilihat oleh user yang login.

## Deploy

Project Vercel: **glowlab-dashboard** (tim Siuddin). Root Directory `dashboard`, terhubung ke repo GitHub ini.
Setiap deploy otomatis menjalankan migrasi database (`vercel-build`) dan membuat admin pertama dari `ADMIN_EMAIL` / `ADMIN_PASSWORD` bila belum ada.

### Hubungkan database (sekali, ±2 menit)
1. Buka project **glowlab-dashboard** di Vercel, lalu tab **Storage → Create Database → Neon (Serverless Postgres)**. Paket gratis cukup; pilih region Singapore.
2. Di langkah *Connect project*, centang environment **Production** dan **Preview**. Vercel otomatis mengisi `DATABASE_URL`.
3. Buka tab **Deployments**, klik ⋯ pada deployment terakhir, lalu pilih **Redeploy**. Migrasi dan admin pertama dibuat otomatis.
4. Login dengan `ADMIN_EMAIL`. Setelah itu ganti password di **Pengaturan**, lalu hapus env `ADMIN_PASSWORD` dari Vercel.

### Environment variables

| Variabel | Isi |
|---|---|
| `DATABASE_URL` | otomatis dari Neon (Vercel Storage) |
| `SESSION_SECRET` | string acak ≥ 32 karakter |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_NAME` | admin pertama (hapus password setelah login) |
| `SPREADSHEET_ID` | `16Mla00sapW6GKX60kb5Wmaq6zaFDLHxISWxGT5pfy-0` |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | JSON service account, untuk sinkron otomatis spreadsheet (opsional; tanpa ini upload tab sheet lewat Impor file) |
| `GLOBEMERCE_WEBHOOK_TOKEN` | string acak, bagian dari URL webhook |
| `INGEST_TOKEN` | string acak, untuk job Python mengirim spend Meta |
| `CRON_SECRET` | string acak, untuk sinkron sheet terjadwal |

### Memasukkan data (menu Impor file)

| Jenis impor | File | Frekuensi |
|---|---|---|
| Spreadsheet DATABASE HARYS | download tab bulan (File → Download → .xlsx) | sampai sinkron otomatis aktif |
| Order Globemerce | Globemerce → export **order list** (.csv) | harian |
| Laporan order Everpro | Everpro → export **order report** (.csv) | harian |
| Daftar customer Globemerce | Globemerce → **Customer List** (.xlsx) | mingguan |

Urutan yang disarankan pertama kali: spreadsheet → Globemerce → Everpro → customer. Semua impor aman diulang tanpa membuat duplikat.

### Sinkron otomatis (opsional)
1. **Spreadsheet tiap jam**: isi `GOOGLE_SERVICE_ACCOUNT_JSON` di Vercel, lalu share sheet ke email service account. Di GitHub repo → Settings → Secrets → Actions, isi `DASHBOARD_URL` dan `CRON_SECRET`.
2. **Globemerce real-time**: salin URL webhook dari menu **Integrasi** ke pengaturan webhook Globemerce. Petakan field-nya sekali setelah event pertama masuk.
3. **Spend Meta Ads harian**: isi secret `DASHBOARD_URL` dan `INGEST_TOKEN` di GitHub.

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
