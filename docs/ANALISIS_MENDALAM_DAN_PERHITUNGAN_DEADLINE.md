# Analisis Mendalam 6 Proyek & Panduan Lengkap Cara Perhitungan Deadline

Dokumen ini merupakan panduan referensi komprehensif untuk **OnTrack Project Intelligence (v3.1)** yang mencakup:
1. **Metodologi & Rumus Perhitungan Deadline** secara detail langkah demi langkah.
2. **Analisis Forensik Mendalam** untuk keenam proyek (`PRJ-001` s/d `PRJ-006`) beserta seluruh bukti rujukan (`update_id`, `source_record_id`, `timestamp`), angka perhitungan, ketidakpastian (*unknowns*), dan rekomendasi tindak lanjut.

---

## BAGIAN A: ARAHAN CARA PERHITUNGAN DEADLINE & KELAYAKAN JADWAL (STEP-BY-STEP)

### 0. Menetapkan Tanggal Acuan (*As-Of Date*)
Sebelum menghitung satu pun metrik jadwal, **wajib menetapkan tanggal acuan deterministik** agar hasil tidak berubah mengikuti tanggal komputer hari ini:
- **As-Of Date Dataset:** `2026-10-06T17:00:00` (tanggal kalender: **`2026-10-06`**).
- **Dasar Penetapan:**
  1. `05_Data_Dictionary.pdf` (hlm. 1 & 7) menyatakan `Dataset Reference Date: 06 October 2026`.
  2. `04_Production_Data.json` menyatakan `"generated_at": "2026-10-06T17:00:00"`.
  3. Update terakhir (`UPD-023` pada `2026-10-06T16:10:00`) dan snapshot terakhir (`DMS-ZETA-002` pada `2026-10-06T16:45:00`) berada tepat sebelum `17:00:00`.

### 1. Konvensi Selisih Hari Kalender
Semua perhitungan hari menggunakan **selisih hari kalender (UTC date delta)**:
$$\text{Selisih Hari} = \frac{\text{UTC}(\text{Tanggal Akhir}) - \text{UTC}(\text{Tanggal Awal})}{86{,}400{,}000\text{ ms}}$$

> **Catatan Transparansi:** Karena dataset tidak menyediakan kalender hari libur atau jadwal shift (5 hari vs 6 hari kerja/minggu), kita menggunakan **hari kalender** sebagai baseline yang konsisten dan mudah diaudit. Jika tim bekerja 5 hari/minggu, beban kerja harian riil akan sekitar **1.4x lebih berat** daripada angka berbasis hari kalender — artinya proyek yang sudah tidak layak secara hari kalender akan **jauh lebih mustahil** pada hari kerja efektif.

### 2. Tujuh Langkah Baku Perhitungan Deadline per Proyek

| Langkah | Metrik | Rumus Matematis | Tujuan / Makna Bisnis |
| :---: | :--- | :--- | :--- |
| **1** | **Durasi Total Proyek** (`Total Days`) | `Deadline - Start Date` | Total anggaran waktu proyek. |
| **2** | **Waktu Berjalan & Sisa Waktu** | `Elapsed = As-Of Date - Start Date`<br>`Remaining = Deadline - As-Of Date`<br>`% Time Elapsed = (Elapsed / Total Days) × 100%` | Mengukur berapa persen waktu sudah habis dan berapa hari tersisa. Jika `Remaining < 0`, proyek sudah **OVERDUE**. |
| **3** | **Audit Matematika Laporan** | `Computed % = (Reported Actual / Target) × 100%`<br>`Math Gap = Reported Progress % - Computed %` | Memeriksa apakah persentase yang diklaim PIC konsisten secara aritmetika dengan angka aktualnya. |
| **4** | **Laju Historis Harian** (`Historical Run-Rate`) | `Rate_Rep = Reported Actual / Elapsed`<br>`Rate_Op = Operational Verified / Effective_Elapsed` | Kecepatan produksi rata-rata nyata per hari. *Catatan khusus:* untuk data usang (`>72 jam`), `Effective_Elapsed` memakai `Last Snapshot Date - Start Date` agar tidak mengasumsikan output 0 selama masa tanpa laporan. |
| **5** | **Sisa Volume & Laju Wajib Harian** (`Required Pace`) | `Rem_Vol = Target - Actual`<br>`Req_Pace = Rem_Vol / Remaining` | Kecepatan minimal per hari yang **harus** dicapai mulai hari ini hingga deadline agar target 100% tercapai tepat waktu. |
| **6** | **Faktor Akselerasi & Proyeksi Keterlambatan** (`Pace Ratio` & `Projected Slip`) | `Accel = Req_Pace / Historical_Rate`<br>`Proj_Days = Rem_Vol / Historical_Rate`<br>`Proj_Finish = As-Of + ceil(Proj_Days)`<br>`Slip = Proj_Finish - Deadline` | - `Accel <= 1.0x`: aman bila laju stabil.<br>- `1.1x – 1.35x`: tertekan (*Pressured*).<br>- `1.35x – 1.75x`: risiko tinggi (*At High Risk*).<br>- `>= 1.75x` atau melewati batas kapasitas max: **Tidak Feasible Secara Matematis**. |
| **7** | **Uji Batas Kapasitas Maksimal** *(bila tersedia)* | `Min_Days_Cap = Rem_Vol / Max_Daily_Capacity`<br>`Best_Finish = As-Of + ceil(Min_Days_Cap)` | Membuktikan apakah proyek masih mungkin selesai **bahkan pada kapasitas penuh 100% tanpa gangguan**. |

---

## BAGIAN B: ANALISIS MENDALAM PER PROYEK (URUTAN PRIORITAS PERHATIAN)

---

### 1. PRJ-002 — Digitalisasi Arsip Beta (`Instansi Beta`) — **CRITICAL ATTENTION (Prioritas #1)**
- **Master (`02_Project_Master.csv`):** PIC Nadia | `2026-09-10` → `2026-10-10` | Target `120,000 pages` | Reported `91,500 pages` (`76.25%`) | Status `ON TRACK` | Last Master Update `2026-10-06T08:10:00`.
- **Bukti Operasional (`04_Production_Data.json`):**
  - `SCAN-BETA-001` (`2026-10-05T23:59:00`): `pages_processed_total = 87,240 pages` (`72.70%`).
  - `SCAN-BETA-002` (`2026-10-06T08:15:00`): `SCN-A: RUNNING`, **`SCN-B: OUT_OF_SERVICE`**, `SCN-C: RUNNING`.
  - `SCAN-BETA-003` (`2026-10-06T15:30:00`): `SCN-A: RUNNING`, **`SCN-B: LIMITED`**, `SCN-C: RUNNING`.
- **Perhitungan Deadline Detail:**
  1. **Durasi Total:** `2026-10-10 - 2026-09-10` = **30 hari**.
  2. **Elapsed / Remaining:** `2026-10-06 - 2026-09-10` = **26 hari (`86.67%` waktu habis)** | Sisa = **4 hari**.
  3. **Audit Persentase:** `91,500 / 120,000 = 76.25%` (konsisten secara aritmetika).
  4. **Laju Historis:**
     - Versi Reported: `91,500 / 26` = **3,519.23 pages/hari**.
     - Versi Operational Log: `87,240 / 26` = **3,355.38 pages/hari** *(atau `87,240 / 25 = 3,489.6/hari` hingga 5 Okt)*.
  5. **Sisa Target & Laju Wajib (dalam 4 hari tersisa):**
     - Versi Reported: `(120,000 - 91,500) / 4` = `28,500 / 4` = **7,125 pages/hari**.
     - Versi Operational Log: `(120,000 - 87,240) / 4` = `32,760 / 4` = **8,190 pages/hari**.
  6. **Faktor Akselerasi & Proyeksi Selesai:**
     - Versi Operational: `8,190 / 3,355.38` = **2.44x laju historis!** Proyeksi pada laju historis: `32,760 / 3,355.38 = 9.76 hari` → `ceil(9.76) = 10 hari` → **`2026-10-16` (+6 hari terlambat)**.
     - Versi Reported: `7,125 / 3,519.23` = **2.02x laju historis!** Proyeksi: `28,500 / 3,519.23 = 8.10 hari` → **`2026-10-15` (+5 hari terlambat)**.
  7. **Uji Batas Kapasitas Maksimal (`UPD-008`: kapasitas normal 3 scanner ≈ `4,500 pages/hari`):**
     - Bahkan jika 3 scanner berjalan 100% normal:
       - Versi Operational: `32,760 / 4,500 = 7.28 hari` → selesai paling cepat **`2026-10-14` (+4 hari terlambat)**.
       - Versi Reported: `28,500 / 4,500 = 6.33 hari` → selesai paling cepat **`2026-10-13` (+3 hari terlambat)**.
     - **Realita saat ini lebih buruk:** `SCN-B` berstatus `LIMITED` (`SCAN-BETA-003`, `UPD-021`: *"kecepatan belum kembali ke kondisi normal"*), sehingga kapasitas efektif `< 4,500 pages/hari`!
- **Temuan Tambahan (Selisih Sumber):** `91,500` (Master `08:10`) vs `87,240` (Scanner Log `23:59` malam sebelumnya) = **selisih `+4,260 pages` dalam jeda 8 jam 11 menit**, padahal kapasitas penuh seharian saja `4,500 pages` dan Scanner B mati sejak sore 5 Okt (`UPD-013`).
- **Ketidakpastian (*Unknowns*):** Penyebab selisih `4,260 pages` (cut-off lag vs over-reporting) dan kecepatan riil `SCN-B` pasca perbaikan belum terukur.
- **Tindakan Segera:** (1) Rekonsiliasi selisih `4,260 pages` dengan PIC Nadia; (2) Keputusan manajemen hari ini: tambah shift/lembur + scanner cadangan ATAU negosiasi ekstensi deadline 4–6 hari dengan Instansi Beta.

---

### 2. PRJ-005 — Integrasi API Epsilon (`Instansi Epsilon`) — **CRITICAL ATTENTION (Prioritas #2)**
- **Master:** PIC Kevin | `2026-09-01` → `2026-10-13` | Target `10 endpoints` | Reported `9` (`90.0%`) | Status `ON TRACK` | Last Update `2026-10-06T07:30:00`.
- **Bukti Operasional (`04_Production_Data.json`):**
  - `API-EPS-001` (`2026-10-06T07:30:00`): `developed=9`, `configured=9`, **`production_tested_endpoints=0`**, `target=10`.
  - `API-EPS-002` (`2026-10-06T07:32:00`): `environment=production`, **`connection_status=NOT_CONFIGURED`**, **`last_successful_connection=null`**.
- **Perhitungan Deadline Detail:**
  1. **Durasi Total:** `2026-10-13 - 2026-09-01` = **42 hari**.
  2. **Elapsed / Remaining:** **35 hari (`83.33%` waktu habis)** | Sisa = **7 hari**.
  3. **Audit Definisi Progress (Definition-of-Done Trap):**
     - Progress Development = `9 / 10 = 90.0%` (masih kurang 1 endpoint belum selesai dev).
     - **Progress Teruji Production = `0 / 10 = 0.0%`!**
  4. **Laju Terverifikasi Production:** `0 / 35 = 0.0 endpoints/hari`.
  5. **Laju Wajib Pengujian Production:** `10 / 7` = **1.43 endpoints/hari** (termasuk setup koneksi, integrasi, bugfix, UAT, dan sign-off) dalam 7 hari kalender — padahal aksesnya belum ada sama sekali!
- **Ketidakpastian (*Unknowns*):** Tidak ada ETA komitmen dari PIC customer untuk pemberian credential & production endpoint (`UPD-006` sejak 4 Okt, `UPD-010`, `UPD-016`), serta status endpoint ke-10 tidak dijelaskan.
- **Tindakan Segera:** Eskalasi level Direktur/Account ke manajemen Instansi Epsilon untuk menetapkan tenggat penyediaan akses (maksimal H+1) sekaligus menyampaikan dampak langsung ke jadwal `2026-10-13` (*change request / schedule reset* jika akses tertunda).

---

### 3. PRJ-004 — Verifikasi Data Delta (`Instansi Delta`) — **HIGH ATTENTION (Prioritas #3)**
- **Master:** PIC Sari | `2026-09-01` → `2026-11-05` | Target `100,000 records` | Reported `45,000` | **`reported_progress_pct = 52.0%`** | Status `ON TRACK`.
- **Bukti Operasional (`04_Production_Data.json`):**
  - `VER-DELTA-001` (`2026-10-06T07:00:00`): `records_verified = 45,000 records` (`45.0%`).
  - `VER-DELTA-002` (`2026-10-06T07:00:00`): `records_skipped_missing_region = 3,200 records` (`6.64%` dari `45,000 + 3,200 = 48,200` record yang disentuh!).
- **Perhitungan Deadline Detail:**
  1. **Durasi Total:** `2026-11-05 - 2026-09-01` = **65 hari**.
  2. **Elapsed / Remaining:** **35 hari (`53.85%` waktu habis)** | Sisa = **30 hari**.
  3. **Audit Matematika Laporan (TEMUAN KRUSIAL):**
     - Rasio aktual/target: `45,000 / 100,000` = **`45.0%`**.
     - Tercatat di Master: **`52.0%`** → **selisih `+7.0 poin persentase`!** Angka `52.0%` ini menyamarkan ketertinggalan terhadap waktu berjalan (`53.85%`), padahal ketertinggalan riil adalah **`-8.85%`** (`45.0%` vs `53.85%`).
  4. **Laju Historis:** `45,000 / 35` = **1,285.71 records/hari**.
  5. **Sisa Volume & Laju Wajib:** `(100,000 - 45,000) / 30` = `55,000 / 30` = **1,833.33 records/hari**.
  6. **Faktor Akselerasi & Proyeksi Selesai:**
     - Akselerasi wajib: `1,833.33 / 1,285.71` = **1.43x (+42.6% lebih cepat dari laju historis!)**.
     - Proyeksi pada laju saat ini: `55,000 / 1,285.71 = 42.78 hari` → `ceil(42.78) = 43 hari` → **`2026-11-18` (+13 hari terlambat!)**.
- **Ketidakpastian (*Unknowns*):** (1) Basis rumus angka `52.0%`; (2) Kapasitas verifikasi harian per operator tidak tersedia (`UPD-023`); (3) Total data sumber lama dengan field `wilayah` kosong dan mekanisme remediasi `3,200` record yang dilewati (`UPD-011`, `VER-DELTA-002`).
- **Tindakan Segera:** Audit sumber angka `52%`, minta rekap kapasitas harian per operator dalam 24 jam, dan sepakati SOP remediasi `3,200` record kosong dengan Instansi Delta.

---

### 4. PRJ-001 — Penataan Arsip Inaktif Alpha (`Instansi Alpha`) — **HIGH ATTENTION (Prioritas #4)**
- **Master:** PIC Raka | `2026-09-01` → `2026-10-15` | Target `400 ML` | Reported `318 ML` (`79.5%`) | Status `ON TRACK`.
- **Bukti Operasional (`04_Production_Data.json`):**
  - `PROD-ALPHA-001` (`2026-10-05T18:00:00`): `verified_quantity = 301.5 ML` (`75.38%`, `VERIFIED`).
  - `PROD-ALPHA-002` (`2026-10-05T18:00:00`): `pending_internal_check_quantity = 16.5 ML` (`PENDING_INTERNAL_CHECK`).
  - **Rekonsiliasi Penting (Jangan Salah Vonis!):** `301.5 + 16.5 = 318.0 ML`! Selisih antara `318` dan `301.5` **bukan kesalahan pelaporan**, melainkan perbedaan tahap workflow (dikonfirmasi `UPD-009`).
- **Perhitungan Deadline Detail:**
  1. **Durasi Total:** `2026-10-15 - 2026-09-01` = **44 hari**.
  2. **Elapsed / Remaining:** **35 hari (`79.55%` waktu habis)** | Sisa = **9 hari**.
  3. **Laju Historis:**
     - Reported (`318 / 35`): **9.09 ML/hari**.
     - Operational Verified (`301.5 / 35`): **8.61 ML/hari**.
  4. **Laju Wajib dalam 9 Hari Tersisa:**
     - Versi Reported (`82 / 9`): **9.11 ML/hari** (`1.00x`, terlihat pas di permukaan).
     - Versi Verified (`98.5 / 9`): **10.94 ML/hari** (**1.27x / +27% lebih cepat** dari laju terverifikasi historis → proyeksi selesai `2026-10-18`, **+3 hari** jika pending tidak segera lolos).
- **Risiko Operasional Tersembunyi:** Pada `UPD-012` (5 Okt) ditemukan perbedaan interpretasi klasifikasi saat uji petik dengan arsiparis customer, dan pada `UPD-019` (6 Okt) Operator 2 melakukan **hold parsial** untuk box dengan pola klasifikasi sama. Meski PM Raka berkoordinasi (`UPD-020`), belum ada keputusan final tertulis maupun kuantifikasi volume yang terdampak rework/hold.
- **Tindakan Segera:** Kunci berita acara/panduan klasifikasi final dari arsiparis customer, kuantifikasi jumlah box/ML yang di-hold & perlu revisi, lalu percepat clearance `16.5 ML` pending check.

---

### 5. PRJ-003 — Penataan dan Pendataan Arsip Gamma (`BUMN Gamma`) — **HIGH ATTENTION / HIGH UNCERTAINTY (Prioritas #5)**
- **Master:** PIC Andi | `2026-08-15` → `2026-10-20` | Target `2,000 boxes` | Reported `1,840 boxes` | **`reported_progress_pct = 94.0%`** | Last Update **`2026-09-30T17:00:00`**.
- **Bukti Operasional:** `WH-GAMMA-001` (`2026-09-30T17:00:00`): `processed_boxes = 1,840 boxes`.
- **Perhitungan Deadline & Staleness Detail:**
  1. **Durasi Total:** `2026-10-20 - 2026-08-15` = **66 hari**.
  2. **Elapsed / Remaining:** **52 hari (`78.79%` waktu habis)** | Sisa = **14 hari**.
  3. **Usia Data (Data Staleness):** `2026-10-06T17:00:00 - 2026-09-30T17:00:00` = **144 jam = 6.0 hari penuh** tanpa satu pun update lapangan maupun input `warehouse_entry`!
  4. **Audit Matematika Laporan:** `1,840 / 2,000 = 92.0%` vs `reported_progress_pct = 94.0%` → **selisih `+2.0%`**.
  5. **Laju Historis hingga Snapshot Terakhir (`2026-09-30`, hari ke-46):** `1,840 / 46` = **40.0 boxes/hari** (sisa `160 boxes` dalam 14 hari hanya butuh `11.43 boxes/hari`).
- **Mengapa Tetap Perlu Perhatian (Anti-Overclaim):** Dengan laju `40 boxes/hari`, secara teori `160 boxes` bisa selesai dalam 4 hari (sekitar 4 Okt) — **ATAU** produksi justru terhenti total sejak 30 Sept tanpa laporan! Karena tidak ada bukti selama 6 hari, sistem menandai **`INSUFFICIENT_DATA` / `HIGH UNCERTAINTY`** alih-alih menebak.
- **Tindakan Segera:** Minta PIC Andi mengirimkan rekap terbaru + unggah `warehouse_entry` per 6 Oktober, serta klarifikasi selisih `94%` vs `92%`.

---

### 6. PRJ-006 — Implementasi DMS Zeta (`Perusahaan Zeta`) — **LOW ATTENTION / VERIFIED COMPLETED (Control Baseline)**
- **Master:** PIC Maya | `2026-07-01` → `2026-09-30` | Target `1 system` | `100.0%` | `COMPLETED` per `2026-09-30T16:00:00`.
- **Bukti Operasional:**
  - `DMS-ZETA-001` (`2026-09-30T16:05:00`): `production`, `ONLINE`, `deployment_status: COMPLETED` (5 menit setelah laporan closeout PM).
  - `DMS-ZETA-002` (`2026-10-06T16:45:00`): `ONLINE`, `active_users_last_24h = 14`, `successful_logins_last_24h = 21`, `failed_logins_last_24h = 1`.
- **Perhitungan Deadline:** Durasi `91 hari`, ditutup tepat pada deadline `2026-09-30` (`0 hari` keterlambatan).
- **Mengapa Tidak Memicu Alarm:**
  - Tidak ada update PM setelah 30 Sept adalah **wajar** untuk proyek `COMPLETED` karena monitoring operasional `DMS-ZETA-002` masih segar (`0.25 jam` sebelum *as-of date*).
  - `1 failed login` merupakan noise operasional wajar yang selaras dengan insiden reset password minor pada `UPD-014` (`2026-10-05`) yang sudah terselesaikan.
- **Catatan Minor (Informational Only):** Populasi total target user berlisensi & dokumen BAST formal tidak tersedia di dataset.
