# OnTrack Project Intelligence — Builder Technical Challenge (v3.1)

> **Build a system that explains what is happening, why it matters, and what to do next.**

Prototype lapisan *project intelligence & control* bergaya **OnTrackProject.ai** untuk **tata.id**. Aplikasi ini memproses data multi-sumber (`02_Project_Master.csv`, `03_Project_Updates.csv`, `04_Production_Data.json`) secara dinamis (tanpa *hardcoding* per `project_id`), memisahkan fakta laporan dari bukti operasional, menghitung kelayakan jadwal/deadline secara transparan, mendeteksi ketidakpastian secara eksplisit, serta mengelola tindak lanjut (*follow-up*) persisten berbasis SQLite dengan kebijakan **Evidence-Based Closure**.

---

## 1. Quick Start (Local Installation & Run)

### Prasyarat
- **Node.js >= 22.5.0** (diuji pada `Node v24.15.0` — memanfaatkan modul bawaan `node:sqlite` tanpa kompilasi native C++).
- **npm >= 10**.

### Instalasi & Menjalankan Aplikasi
```bash
npm install
npm run dev
```

Aplikasi akan berjalan secara lokal pada:
- **Frontend (React + Vite + Tailwind CSS):** `http://127.0.0.1:5173`
- **Backend API (Express + TypeScript + SQLite):** `http://127.0.0.1:4000`
- **SQLite Database:** `data/ontrack.sqlite` (otomatis dibuat dan di-*seed* dari folder `data/` saat startup).

### Memeriksa & Menjalankan Automated Tests (D3)
```bash
npm test                    # 124 automated tests (Vitest + Supertest)
npm run verify -w backend   # 58 pemeriksaan rute API, RBAC, dan integritas data
npm run build               # Type-check strict TypeScript (backend & frontend) + Vite bundle
npm run proof               # Regenerasi seluruh bukti eksekusi ke folder proof/
```

### Peta Dokumen & Bukti di Repository
- **Presentasi (10 Slide):** [docs/PRESENTATION.pdf](docs/PRESENTATION.pdf)
- **Refleksi (5 Pertanyaan):** [docs/REFLECTION.md](docs/REFLECTION.md)
- **Decision Log:** [docs/DECISION_LOG.md](docs/DECISION_LOG.md)
- **Bug & Fix Log:** [docs/BUG_LOG.md](docs/BUG_LOG.md)
- **Proof Pack & Hasil Skrip:** [docs/PROOF_PACK.md](docs/PROOF_PACK.md) & [proof/](proof/)
- **Analisis Mendalam & Rumus Deadline:** [docs/ANALISIS_MENDALAM_DAN_PERHITUNGAN_DEADLINE.md](docs/ANALISIS_MENDALAM_DAN_PERHITUNGAN_DEADLINE.md)
- **AI Usage Disclosure:** [AI_USAGE.md](AI_USAGE.md)

---

## 2. Business Interpretation & Key Findings (As-Of `2026-10-06T17:00:00`)

Tanggal acuan (*as-of date*) ditetapkan pada **`2026-10-06T17:00:00`** sesuai `Dataset Reference Date: 06 October 2026` pada `05_Data_Dictionary.pdf` dan `generated_at: "2026-10-06T17:00:00"` pada `04_Production_Data.json`. Pengguna dapat mengubah `As-Of Date` secara dinamis di UI atau parameter `?asOf=` untuk simulasi historis.

| Project | Reported Status & Progress | Operational Verified | Remaining Days | Attention Level | Ringkasan Temuan Utama (Traceable) |
| :--- | :--- | :--- | :---: | :---: | :--- |
| **PRJ-002** (Beta) | `ON TRACK` — `76.25%` (`91,500` pages) | `72.70%` (`87,240` pages, `SCAN-BETA-001`) | **4 hari** (`2026-10-10`) | **CRITICAL** | **Jadwal tidak feasible secara matematis:** butuh `8,190 pages/hari` vs kapasitas max normal `4,500/hari` (`UPD-008`) & historis `3,355/hari`; `SCN-B` masih `LIMITED` (`SCAN-BETA-003`); selisih `+4,260 pages` vs log. |
| **PRJ-005** (Epsilon) | `ON TRACK` — `90.0%` (`9/10` endpoints) | **`0.0%`** (`0/10` prod-tested, `API-EPS-001`) | **7 hari** (`2026-10-13`) | **CRITICAL** | **Validation / DoD Trap & External Blocker:** `90%` hanya development; koneksi production `NOT_CONFIGURED` (`API-EPS-002`, `last_successful_connection: null`); menunggu credential customer tanpa ETA (`UPD-006`, `UPD-016`). |
| **PRJ-004** (Delta) | `ON TRACK` — `52.0%` (`45,000` records) | `45.0%` (`45,000` records, `VER-DELTA-001`) | **30 hari** (`2026-11-05`) | **HIGH** | **Selisih aritmetika `+7.0%`** (`45,000/100,000 = 45%`, bukan `52%`); **defisit laju** (`1,833/hari` wajib vs `1,286/hari` historis → proyeksi `+13 hari` terlambat); `3,200` record dilewati akibat field wilayah kosong (`VER-DELTA-002`, `6.64%` skip rate); kapasitas per operator belum tersedia (`UPD-023`). |
| **PRJ-001** (Alpha) | `ON TRACK` — `79.5%` (`318` ML) | `75.38%` (`301.5` ML verified + `16.5` ML pending) | **9 hari** (`2026-10-15`) | **HIGH** | **Workflow-State Gap (bukan error):** `301.5 + 16.5 = 318 ML` (`PROD-ALPHA-001/002`, `UPD-009`), namun **hold parsial & risiko rework klasifikasi** (`UPD-012`, `UPD-019`) mengancam laju wajib terverifikasi (`10.94 ML/hari` vs `8.61 ML/hari` historis). |
| **PRJ-003** (Gamma) | `ON TRACK` — `94.0%` (`1,840` boxes) | `92.0%` (`1,840` boxes per `2026-09-30`) | **14 hari** (`2026-10-20`) | **HIGH** *(High Uncertainty)* | **Data Usang / Blind Spot 6 hari penuh** (tidak ada update maupun log gudang sejak `2026-09-30T17:00:00`) + **selisih aritmetika `+2.0%`** (`1,840/2,000 = 92%`, bukan `94%`). Sistem secara eksplisit menyatakan status aktual **belum terverifikasi** (tidak mengasumsikan gagal maupun aman). |
| **PRJ-006** (Zeta) | `COMPLETED` — `100.0%` (`1` system) | `ONLINE` / `COMPLETED` (`14` active users/24h) | `0` (selesai `2026-09-30`) | **LOW** *(Verified OK)* | **Baseline sehat:** selesai tepat waktu, terkonfirmasi `ONLINE` (`DMS-ZETA-001/002`, `21` login sukses, `1` gagal selaras reset password `UPD-014`). Tidak memicu false alarm. |

> Untuk rincian lengkap analisis per proyek dan panduan langkah demi langkah perhitungan deadline, lihat [ANALISIS_MENDALAM_DAN_PERHITUNGAN_DEADLINE.md](docs/ANALISIS_MENDALAM_DAN_PERHITUNGAN_DEADLINE.md).

---

## 3. Architecture & Data Flow

```text
[ Authoritative Sources ]        [ Backend API & Intelligence Engine ]          [ Frontend UI ]
 02_Project_Master.csv   ──┐      ┌─ parsers.ts (Validation & Quarantine P6)     ┌─ PortfolioView (Director)
 03_Project_Updates.csv  ──┼─────▶├─ db.ts (SQLite WAL + Idempotent Refresh P5) ─┼─ ProjectDetailView (3-Layer)
 04_Production_Data.json ──┘      ├─ deadlineEngine.ts (Pace & Slip Formulas)    ├─ DeadlineBreakdown (Audit)
                                  ├─ intelligenceEngine.ts (Generic Rules R1-R6) ├─ FollowUpPanel (Sec. 11)
                                  └─ app.ts (REST API + Zod Validation)          └─ RefreshModal (Live Ingest)
```

Rantai pemrosesan mengikuti misi produk secara eksplisit:
**`SOURCE → PROJECT CONTEXT → EVIDENCE → INTERPRETATION → ATTENTION → FOLLOW-UP`**

### Tiga Lapisan Kebenaran (Never Silently Overwrite)
1. **Reported Master (`02_Project_Master.csv`) & Human Updates (`03_Project_Updates.csv`):** Klaim yang dilaporkan PIC/PM/Account/Operator/Vendor.
2. **Operational Evidence (`04_Production_Data.json`):** Observasi sistem produksi/monitoring (`archive_production_report`, `scanner_production_log`, `warehouse_entry`, `verification_application`, `api_monitor`, `dms_monitor`).
3. **Application Interpretation:** Hasil evaluasi aturan generik **R1–R6** yang menautkan setiap kesimpulan ke `update_id`, `source_record_id`, `source_type`/`source_system`, dan `timestamp`.

---

## 4. Explainable Attention Rules (100% Generic — Zero `project_id` Hardcoding)

| Rule Code | Kategori | Logika Generik |
| :--- | :--- | :--- |
| **`R1_REPORT_MATH_MISMATCH`** | Report Inconsistency | Bandingkan `reported_progress_pct` vs `(reported_actual / target) × 100`. Jika `|selisih| > 0.5%`, tandai inkonsistensi tanpa menimpa nilai laporan. |
| **`R2A_WORKFLOW_STATE_GAP`** | Workflow-State Gap | Jika `verified_quantity + pending_internal_check_quantity ≈ reported_actual`, jelaskan bahwa ini perbedaan definisi tahap workflow (bukan error), sambil menyorot volume yang belum terverifikasi. |
| **`R2B_REPORT_VS_OPERATIONAL_GAP`** | Source Discrepancy | Jika `reported_actual` berbeda dengan volume log operasional tanpa pasangan `pending`, tampilkan kedua angka, timestamp, dan selisih jamnya. |
| **`R2C_VALIDATION_DOD_GAP`** | Validation Gap | Jika record integrasi memiliki `developed_endpoints > production_tested_endpoints`, sorot gap antara kemajuan *development* dan validasi *production*. |
| **`R3_SCHEDULE_*`** | Schedule Feasibility | Evaluasi `remaining_days`, `required_daily_rate`, `acceleration_factor = required / historical`, proyeksi keterlambatan (`projected_slip_days`), serta batas kapasitas harian bila disebut di update. |
| **`R4A–R4D`** | Operational Health / Blockers / Quality | Deteksi status perangkat terbaru (`OUT_OF_SERVICE`/`LIMITED`), `connection_status != CONNECTED`, `records_skipped_* > 0`, serta sinyal hold/rework/missing-capacity pada update. |
| **`R5_DATA_STALENESS_BLIND_SPOT`** | Data Staleness | Untuk proyek non-`COMPLETED`, jika update DAN log operasional berumur `>= 72 jam`, tandai *High Uncertainty / Visibility Gap* tanpa memvonis terlambat. |

---

## 5. Deadline & Pace Calculation Methodology

Ringkasan rumus inti pada `backend/src/deadlineEngine.ts` (seluruh substitusi angka tampil otomatis di UI *Project Detail → Analisis Deadline*):

1. **Total Duration:** `Total Days = Deadline - Start Date` (selisih hari kalender UTC).
2. **Elapsed & Remaining Days:** `Elapsed = As-Of Date - Start Date`; `Remaining = Deadline - As-Of Date`; `% Time Elapsed = (Elapsed / Total Days) × 100%`.
3. **Historical Run-Rate:** `Historical Pace = Actual / Elapsed Days` *(untuk proyek dengan data usang >72 jam, laju operasional dihitung sampai tanggal snapshot terakhir agar tidak mengasumsikan output 0 selama masa tanpa laporan)*.
4. **Required Daily Pace:** `Required Pace = (Target - Actual) / Remaining Days`.
5. **Acceleration Factor:** `Pace Ratio = Required Pace / Historical Pace`.
6. **Projected Finish & Slip:** `Projected Finish = As-Of Date + ceil(Remaining Volume / Historical Pace)`; `Projected Slip = Projected Finish - Deadline`.
7. **Capacity Ceiling Check (bila kapasitas disebut di update):** `Min Days = Remaining Volume / Stated Max Capacity`.

---

## 6. Follow-Up Workflow & Evidence-Based Closure (Section 11)

Status **tindakan** dipisahkan secara tegas dari status **verifikasi masalah operasional**:
- `action_status`: `OPEN` → `IN_PROGRESS` → `RESOLVED` / `CANCELLED`.
- `verification_status`: `NOT_APPLICABLE` → **`AWAITING_EVIDENCE`** (otomatis saat `RESOLVED`) → **`VERIFIED_BY_EVIDENCE`**.
- Menandai follow-up sebagai `RESOLVED` **TIDAK** menghapus sinyal perhatian proyek.
- Endpoint `POST /api/followups/:id/verify` mewajibkan `source_record_id` dari `Production Data` milik proyek yang sama dengan **`timestamp >= resolved_at`** (bukti pra-penyelesaian ditolak `400 Bad Request`).
- Seluruh transisi tercatat permanen di tabel `follow_up_history`.

---

## 7. Data Refresh, Conflict & Resilience Policies (P5 & P6)

- **Exact Duplicate** (ID & payload hash sama): dilewati secara idempoten (`duplicate_skipped`).
- **Conflicting Duplicate** (ID sama, payload berbeda): record orisinal **dipertahankan** (immutable evidence), konflik dicatat di `ingestion_runs.warnings` (`conflict_flagged`), tidak menimpa diam-diam.
- **Older / Out-of-Order Record** (`timestamp < latest` untuk `project_id` & `record_type`): disimpan ke kronologi historis sebagai `historical_backfill` tanpa menimpa snapshot operasional terbaru.
- **Malformed / Invalid Input (P6):** Baris dengan field wajib kosong, tanggal invalid, `deadline < start_date`, `target <= 0`, atau metrik non-numerik dikarantina ke `warnings` (tidak membuat aplikasi crash dan tidak memaksa nilai menjadi `0`).

---

## 8. REST API Reference

| Method & Endpoint | Fungsi |
| :--- | :--- |
| `GET /api/health` | Status API, default `as_of_date`, jumlah proyek, ringkasan ingestion terakhir |
| `GET /api/portfolio?asOf=YYYY-MM-DDTHH:MM:SS` | KPI portofolio & seluruh proyek terurut berdasarkan prioritas perhatian |
| `GET /api/projects/:projectId?asOf=...` | Detail proyek, 3-layer truth, step-by-step deadline math, sinyal, unknowns, timeline, follow-ups |
| `GET /api/followups?projectId=...` | Daftar follow-up beserta audit trail `history[]` |
| `POST /api/followups` | Buat follow-up baru (validasi Zod + simpan ke SQLite) |
| `PATCH /api/followups/:id` | Ubah status/owner/due date + tulis audit trail + enforce `AWAITING_EVIDENCE` saat `RESOLVED` |
| `POST /api/followups/:id/verify` | Verifikasi follow-up `RESOLVED` dengan `source_record_id` pasca-penyelesaian |
| `POST /api/refresh` | Muat ulang file CSV/JSON dari folder `data/` |
| `POST /api/ingest` | Ingest payload CSV/JSON ad-hoc (untuk demo perubahan input / live change readiness) |
| `POST /api/data/master` | Edit Project Master atau tambah proyek baru dari UI Dashboard **Kelola Data** + rekalkulasi instan |
| `POST /api/data/production` | Tambah snapshot bukti operasional baru (append-only immutable) dari UI + rekalkulasi instan |
| `POST /api/data/updates` | Tambah update lapangan / kapasitas harian baru dari UI + rekalkulasi instan |
| `POST /api/data/reset` | Reset tabel sumber kembali ke file asli di `data/` (opsional mempertahankan follow-up) |
| `GET /api/ingestion/runs` | Riwayat eksekusi ingestion, konflik, duplikat, dan record terkarantina |

---

## 9. Role & Access Control Plan (Production Evolution)

Sesuai brief, autentikasi multi-role tidak diimplementasikan pada prototipe ini. Sebagai gantinya, header aplikasi menyediakan **Persona Switcher simulasi (tanpa login/password)** antara **Director (All Projects)** dan **PIC (`Raka`, `Nadia`, `Andi`, `Sari`, `Kevin`, `Maya` — diambil dinamis dari dataset)** yang ditegakkan di **Frontend UI maupun Backend API (`X-Actor-Role` / `X-Actor-Name` → `403 Forbidden`)**: PIC hanya dapat mengubah laporan Master & Update pada proyek miliknya sendiri, tidak dapat mengedit proyek PIC lain, tidak dapat memodifikasi bukti operasional sistem, dan tidak dapat *self-verify* penutupan isu.

Untuk produk nyata OnTrackProject.ai, RBAC dirancang sebagai berikut:
- **Director / Executive:** Akses baca seluruh portofolio, pembuatan follow-up eskalasi, serta hak *approve* `VERIFIED_BY_EVIDENCE` pada penutupan masalah kritis.
- **Project Manager / PIC:** Akses baca/tulis pada proyek yang ditugaskan (`project_memberships`), dapat memperbarui status follow-up hingga `RESOLVED`, namun **tidak** dapat menimpa atau memverifikasi sendiri penutupan bukti kritis tanpa bukti sistem (*separation of duties*).
- **Operations / Ingestion Service Account:** Token API khusus untuk *push* snapshot otomatis ke `POST /api/ingest` (append-only, immutable).
- **Auditor / QA:** Akses *read-only* terhadap `follow_up_history`, `ingestion_runs`, dan payload mentah.

---

## 10. Assumptions, Known Limitations & Trade-Offs

### Asumsi Utama
1. `As-Of Date` default adalah `2026-10-06T17:00:00` (konsisten dengan Data Dictionary & `Production_Data.json`).
2. Perhitungan jadwal menggunakan **hari kalender** karena kalender hari kerja/shift/libur per customer tidak tersedia di dataset.
3. Ambang batas staleness proyek aktif ditetapkan **72 jam** (3 hari); dapat diubah menjadi konfigurasi per tipe proyek.

### Keterbatasan yang Diketahui (Known Limitations)
1. **UI Berbahasa Indonesia:** Seluruh antarmuka dan pesan interpretasi ditulis dalam Bahasa Indonesia sesuai konteks brief pelanggan tata.id (belum mendukung *i18n* multi-bahasa).
2. **Klaim 501 Kueri untuk 500 Proyek Belum Diuji Beban:** Analisis bottleneck N+1 pada `GET /api/portfolio` (1 kueri master + kueri anak per proyek; di atas 500 proyek menjadi >501 kueri) diturunkan secara struktural dari kode sumber, namun **belum diuji beban (*load test*)** pada 500 proyek sintetis.
3. **Berkas Excel Tidak Dibandingkan Secara Otomatis:** Sesuai aturan sumber data di `06_Submission_Guide.txt`, aplikasi hanya memproses berkas otoritatif CSV dan JSON di folder `data/`; `07_OnTrack_Requirements_and_Data.xlsx` tidak diparsing atau dibandingkan otomatis oleh skrip.
4. **Deteksi Sinyal Teks Deterministik:** Aturan `R4D` (hold/rework) dan ekstraksi kapasitas harian menggunakan regex deterministik bilingual demi 100% *explainability*, belum menggunakan klasifikasi semantik/LLM.
5. **Simulasi Persona Tanpa Autentikasi Penuh:** Header menyediakan *Persona Switcher* (`Director` vs `PIC`) yang ditegakkan lewat header `X-Actor-Role`/`X-Actor-Name` di UI dan Backend API (`403 Forbidden`), namun belum menggunakan token autentikasi SSO/JWT produksi.

### Next Steps (Roadmap)
1. **Time-Series Rolling Velocity:** Simpan snapshot harian sehingga proyeksi jadwal menggunakan laju 7-hari terakhir (*rolling velocity*), bukan hanya rata-rata kumulatif sejak `start_date`.
2. **Auto-Link Signal Resolution:** Petakan setiap `linked_signal_code` ke predikat pemulihan otomatis saat ingestion menerima bukti baru.
3. **Connectors, Load Testing & RBAC:** Integrasi konektor *webhook/scheduled sync* dari sistem DMS/API/Scanner, uji beban 500 proyek + *materialized snapshots* di PostgreSQL, serta autentikasi SSO/RBAC.

---

## 11. Time Allocation (Rentang Kerja Aktif: 3 Jam 49 Menit)

Alokasi waktu tercatat **3 jam 49 menit** rentang kerja aktif (tidak mengklaim 6 jam penuh karena jejak komit tidak membuktikannya):

| Tahap | Alokasi Waktu | Fokus Pekerjaan |
| :--- | :---: | :--- |
| 1. Analisis Data & Desain Arsitektur | 35 menit | Forensik 6 proyek, audit aritmetika & jadwal, desain aturan generik R1–R6 & skema SQLite |
| 2. Backend, Parsers, Rule Engine & API | 1 jam 05 menit | Parsers tangguh (P6), `deadlineEngine.ts`, `intelligenceEngine.ts`, SQLite, Section 11 & Persona RBAC |
| 3. Frontend UI (Portfolio, Detail, Kelola Data) | 1 jam 04 menit | Dashboard eksekutif, 3-layer truth, tabel langkah deadline, follow-up, Persona Switcher, & Data Manager + Reset Awal |
| 4. Automated Testing (124 Test) & Verify (58 Cek) | 35 menit | 5 suite test Vitest (124 test) + skrip `verify.ts` (58 cek) + pembangkit `proof/` |
| 5. Dokumentasi & Presentasi (10 Slide) | 30 menit | `README.md`, `AI_USAGE.md`, `REFLECTION.md`, `DECISION_LOG.md`, `BUG_LOG.md`, `PROOF_PACK.md`, & `PRESENTATION.pdf` |
| **Total Rentang Kerja Aktif** | **3 jam 49 menit** | Seluruh deliverable D1–D6 selesai, teruji, dan dapat direproduksi |

---

## 12. Reflection Questions (D6)

Jawaban lengkap atas 5 pertanyaan refleksi tersedia di [docs/REFLECTION.md](docs/REFLECTION.md).
