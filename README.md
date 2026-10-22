# AI Assistant — Performance Marketing

Asisten otomatis yang setiap pagi mengirim laporan ke **Telegram** dan **WhatsApp**:

- **Meta Ads**: spend, purchase, CPP, ROAS Meta, CPM, CTR link, CPC, hook rate, hold rate, frekuensi, leads (total dan per akun)
- **Omzet riil** dari spreadsheet harian, per kategori (O = order baru, F = follow up, R = repeat order) dan per metode bayar
- **MER akuisisi** (omzet O+F ÷ spend) dan **CAC** (spend ÷ jumlah customer baru) sebagai KPI utama iklan, ditambah MER total, porsi repeat order, dan proyeksi akhir bulan. Repeat order tidak dihitung sebagai hasil iklan.
- **Performa CS**: order dan omzet per CS, kemarin dan bulan berjalan
- **Alert** ketika angka melewati ambang di `config.yaml`
- **Cek kualitas data** sheet (baris tanpa tanggal, tanpa kode CS, atau kategori F/O/R yang tidak cocok)
- **Insight AI** (opsional, dari Claude): 3–6 poin analisis dan rekomendasi

Data pribadi customer (nama, alamat, nomor WA) **tidak pernah dibaca** ke laporan maupun ke AI.

## Status roadmap

| Tahap | Isi | Status |
|---|---|---|
| 1 | Laporan harian Meta Ads + omzet + CS ke Telegram/WA | ✅ kode siap, tinggal isi kredensial |
| 2 | Output tim kreatif dari Notion + performa per kreatif/editor | ⏳ |
| 3 | Alert real-time (tiap beberapa jam) + dashboard Looker Studio | ⏳ |

## Struktur

```
config.yaml                 # ID sheet, mapping kolom, akun iklan, ambang alert
src/assistant/
  sales.py                  # baca & ringkas spreadsheet omzet
  meta_ads.py               # tarik insight Meta Marketing API
  report.py                 # metrik gabungan, alert, teks laporan
  insights.py               # analisis singkat dari Claude (opsional)
  notify.py                 # kirim ke Telegram & WhatsApp (Fonnte)
  __main__.py               # perintah utama
.github/workflows/daily-report.yml   # jadwal otomatis 07:17 WIB
```

## Setup (sekali saja)

### 1. Meta Ads — System User token
1. Buka **Business Settings → Users → System users** di setiap Business Manager pemilik akun iklan.
2. Buat system user (role *Employee* sudah cukup), lalu **Add assets** dan pilih akun iklan dengan izin *View performance*.
3. **Generate token**, pilih app Anda, centang `ads_read`, lalu set masa berlaku *Never*.
4. Simpan sebagai `META_ACCESS_TOKEN`.

> Ketiga akun saat ini berada di Business Manager yang berbeda (SVO Connect 01, SVO Connect 02, SM External Imers 10). Satu system user perlu diberi akses ke ketiganya, misalnya lewat partner sharing. Kalau tidak bisa, beri tahu saya dan saya ubah kodenya supaya mendukung token per akun.

### 2. Google Sheets — Service account
1. Buka [Google Cloud Console](https://console.cloud.google.com/), buat project, lalu aktifkan **Google Sheets API**.
2. Buka **IAM → Service Accounts → Create**, lalu **Keys → Add key → JSON**.
3. **Share spreadsheet** "DATABASE HARYS 2026" ke email service account (`...@...iam.gserviceaccount.com`) sebagai **Viewer**.
4. Isi seluruh JSON (satu baris) ke `GOOGLE_SERVICE_ACCOUNT_JSON`.

### 3. Telegram
1. Chat [@BotFather](https://t.me/BotFather), kirim `/newbot`, dan simpan tokennya sebagai `TELEGRAM_BOT_TOKEN`.
2. Masukkan bot ke grup tujuan dan kirim satu pesan di grup itu.
3. Buka `https://api.telegram.org/bot<TOKEN>/getUpdates`. Ambil `chat.id` (untuk grup diawali `-100…`) dan simpan sebagai `TELEGRAM_CHAT_ID`.

### 4. WhatsApp (Fonnte)
1. Daftar di [fonnte.com](https://fonnte.com), hubungkan nomor WA dengan scan QR, lalu salin token device ke `FONNTE_TOKEN`.
2. Isi `WHATSAPP_TARGET` dengan nomor tujuan (`628xxx`, boleh beberapa dipisah koma) atau ID grup WA.

> Fonnte adalah gateway tidak resmi. Gunakan nomor khusus untuk laporan, jangan nomor CS utama. Untuk jalur resmi, WhatsApp Cloud API bisa ditambahkan nanti.

### 5. (Opsional) Insight AI
Buat API key di [console.anthropic.com](https://console.anthropic.com) dan simpan sebagai `ANTHROPIC_API_KEY`. Kalau dikosongkan, laporan tetap terkirim tanpa bagian insight.

### 6. Pasang di GitHub Actions
Buka repo → **Settings → Secrets and variables → Actions → New repository secret**, lalu isi semua variabel di `.env.example`. Workflow **Laporan harian** akan jalan otomatis pukul 07:17 WIB. Untuk tes, jalankan manual dari tab **Actions → Laporan harian → Run workflow**.

## Menjalankan secara lokal

```bash
pip install -e ".[dev]"
cp .env.example .env   # isi kredensial, lalu: set -a; source .env; set +a

python -m assistant --dry-run                   # laporan kemarin, cetak saja
python -m assistant --date 2026-10-21 --dry-run
python -m assistant                             # buat dan kirim ke Telegram/WA
pytest                                          # tes
```

## Menyesuaikan

- **Ambang alert**: ubah bagian `targets` di `config.yaml`. Nilai saat ini masih sementara.
- **Tambah akun iklan**: tambahkan `id` ke `meta.ad_accounts`.
- **Kolom sheet berubah**: ubah `sales.columns`. Kode membaca tab sesuai nama bulan (`OKTOBER`, `NOVEMBER`, …), jadi tab bulan baru harus mengikuti format kolom yang sama.
- **Repo publik?** Pindahkan `spreadsheet_id` dan ID akun iklan ke secrets.
