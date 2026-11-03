# BI-ERP: Sistem Form Batch Transaksi, Invoice & Verifikasi Anggaran Terpadu

Aplikasi **Form Batch ERP (Enterprise Resource Planning)** dirancang khusus untuk memenuhi standar administrasi pengeluaran keuangan, pengelolaan tagihan invoice, verifikasi pembebanan anggaran (COA/DHA), serta pencetakan slip **Surat Perintah Pembayaran (SPP)** resmi.

---

## 1. Arsitektur Teknologi

| Komponen | Teknologi | Deskripsi |
| :--- | :--- | :--- |
| **Frontend** | Vue 3 (Composition API) | State management reaktif, modular, performa tinggi |
| **Build Tool** | Vite | Kompilasi cepat dan Hot Module Replacement (HMR) |
| **UI Framework** | Bootstrap 5 + Bootstrap Icons | Enterprise Dashboard grid, typography Inter, font JetBrains Mono |
| **Backend API** | Node.js & Express.js | Arsitektur REST API dengan JSON payload |
| **Database** | MySQL / MariaDB | Relasional database dengan prepared statements & transactions |
| **Database Admin** | phpMyAdmin (XAMPP / Laragon / Standalone) | Import schema SQL sekali klik |

---

## 2. Struktur Proyek

```text
BI/
├── backend/                        # REST API Express.js
│   ├── config/
│   │   └── database.js             # MySQL Connection Pool & Parameterized Queries
│   ├── controllers/
│   │   ├── batchController.js      # CRUD, Validasi Dokumen, Transaksi Atomik
│   │   └── masterController.js     # Master Uker, Rekanan, Pejabat, DHA, COA
│   ├── middlewares/
│   │   └── errorHandler.js         # Centralized Error Logger & Response Handler
│   ├── routes/
│   │   ├── batchRoutes.js          # Routing endpoint /api/batches
│   │   └── masterRoutes.js         # Routing endpoint /api/masters
│   ├── .env.example                # Template konfigurasi port & database
│   ├── .env                        # File konfigurasi aktif
│   ├── package.json                # Dependensi Express, MySQL2, CORS, Dotenv
│   └── server.js                   # Entry point backend server
│
├── database/
│   └── schema.sql                  # Database DDL & Seed Data lengkap untuk phpMyAdmin
│
├── frontend/                       # Proyek modern Vue 3 + Vite
│   ├── src/
│   │   ├── services/
│   │   │   └── api.js              # Service API client dengan offline fallback
│   │   ├── App.vue                 # Komponen utama form batch & data monitoring
│   │   ├── main.js                 # Inisialisasi Vue 3
│   │   └── style.css               # Design System Navy Enterprise & Print A4
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── index.html                      # Versi Browser Standalone (Langsung Buka)
├── app.js                          # Logika Vue 3 Standalone + Dual Mode
├── style.css                       # Stylesheet Terpadu
└── README.md                       # Dokumentasi Arsitektur & Instalasi
```

---

## 3. Panduan Setup Database (phpMyAdmin / MySQL)

1. Buka browser dan akses **phpMyAdmin** (biasanya di `http://localhost/phpmyadmin`).
2. Buat database baru bernama `form_batch_erp` (atau biarkan backend membuat otomatis).
3. Klik tab **Import** pada phpMyAdmin.
4. Pilih file `database/schema.sql` yang berada di folder proyek ini.
5. Klik tombol **Go / Kirim**.
6. Database `form_batch_erp` beserta tabel `batches`, `batch_invoices`, `batch_coas`, serta master data (`master_uker`, `master_rekanan`, `master_pejabat`, `master_dha`, `master_coa`) dan seed data transaksi awal akan terpasang lengkap.

---

## 4. Menjalankan Backend (Node.js & Express)

1. Buka terminal pada folder `backend/`:
   ```bash
   cd backend
   npm install
   ```
2. Pastikan file `.env` sudah sesuai dengan kredensial MySQL Anda (secara default `user=root`, `password=`, `database=form_batch_erp`).
3. Jalankan server:
   ```bash
   npm start
   ```
4. Server API akan aktif pada: `http://localhost:5000` (Endpoint health check: `http://localhost:5000/api/health`).

---

## 5. Menjalankan Frontend (Vite + Vue 3)

1. Buka terminal pada folder `frontend/`:
   ```bash
   cd frontend
   npm install
   npm run dev
   ```
2. Aplikasi web dashboard akan terbuka pada: `http://localhost:5173`.

---

## 6. Opsi Menjalankan Versi Standalone (Tanpa Node.js)

Aplikasi ini dilengkapi dengan **Dual-Engine Architecture**. Anda dapat langsung membuka file `index.html` di browser mana saja:
- Seluruh tampilan modern, validasi, 4 slot invoice, 3 alokasi COA, cetak A4, pencarian, dan filtering berjalan penuh.
- Jika server Node.js aktif di port 5000, aplikasi otomatis beralih ke **REST API Aktif**.
- Jika server belum dijalankan, aplikasi tetap berfungsi penuh menggunakan penyimpanan **Offline Local Storage**.

---

## 7. Fitur Bisnis Utama

1. **Informasi Dokumen & Satker**:
   - Validasi kelengkapan nomor dokumen dan deteksi otomatis duplikasi nomor dokumen (`check-doc`).
   - Pemilihan Satker/Uker pengaju dan tujuan secara terintegrasi.
   - Pembatasan uraian perihal transaksi maksimal 300 karakter.
2. **Pengelolaan 4 Slot Invoice**:
   - Tersedia 4 slot invoice terstruktur (Nomor, Tanggal, Nominal).
   - Perhitungan otomatis Total Bruto dan konversi resmi ke **Terbilang Rupiah** Indonesia.
   - Pencatatan nomor e-Faktur Pajak dan tanggal faktur.
3. **Data Rekanan & Wajib Pajak**:
   - Master rekanan dengan auto-fill Alamat, NIK/NPWP, Nama WP, Nama Bank, dan Nomor Rekening.
   - Field tetap dapat disesuaikan secara dinamis oleh pengguna berwenang.
4. **Pembayaran & Rekening Bank**:
   - Penyimpanan nomor rekening sebagai tipe data `string` agar angka nol (`0`) di awal tidak hilang.
5. **Pembebanan Anggaran (DHA & COA)**:
   - Visual Meter Saldo DHA dengan indikator persentase real-time.
   - 3 Baris alokasi Chart of Accounts (COA) dengan tombol auto-balance (`=`).
   - Status rekonsiliasi visual (Seimbang vs Selisih).
6. **Data Monitoring & Tabel Riwayat Batch**:
   - Pencarian multi-kriteria (Batch, Dokumen, Perihal, Uker, Rekanan).
   - Filter status transaksi (Diajukan, Disetujui, Cair, Draft).
   - Pengurutan dinamis berdasarkan kolom (*sortable columns*).
   - Pagination (5, 10, 20 baris per halaman).
   - Ekspor data batch ke format CSV / Excel.
7. **Pencetakan Voucher & Slip SPP**:
   - Format standar A4 portrait resmi Bank Indonesia Kantor Perwakilan Jember.
   - Otomatis menyembunyikan header, sidebar, dan toolbar aksi saat proses pencetakan.
8. **Audit Trail & Keamanan**:
   - Prepared statements pada backend mencegah serangan SQL Injection.
   - Transaksi database atomik menjamin konsistensi data invoice & COA.
   - Fitur Soft Delete mencatat waktu dan identitas penghapus data.
