# AI Usage Disclosure (`AI_USAGE.md`)

Dokumen ini mencatat secara transparan penggunaan alat bantu AI selama pengerjaan **OnTrack Project Intelligence — Builder Technical Challenge (v3.1)**.

## 1. Alat AI yang Digunakan
- **Google Antigravity (AI Coding Assistant):** Digunakan sebagai *engineering pair* untuk mempercepat analisis data awal, *scaffolding* TypeScript/React/Express, penulisan *boilerplate* komponen UI, penyusunan *unit/integration tests*, dan pembuatan draf dokumentasi serta slide presentasi.

## 2. Pekerjaan yang Dibantu AI
- Ekstraksi dan pembacaan cepat struktur seluruh berkas tantangan (`PDF`, `CSV`, `JSON`, `XLSX`).
- Implementasi awal modul `parsers.ts`, `deadlineEngine.ts`, `intelligenceEngine.ts`, `db.ts` (`node:sqlite`), REST API `app.ts`, dan komponen frontend React + Tailwind CSS.
- Penyusunan *automated test suite* (`Vitest` + `Supertest`) dan pembuatan skrip pembangkit presentasi (`PRESENTATION.pptx` & `PRESENTATION.pdf`).

## 3. Bagian yang Diverifikasi Sendiri (Independent Engineering Verification)
- **Audit Angka & Perhitungan Deadline Manual:** Seluruh angka untuk 6 proyek (`PRJ-001` s/d `PRJ-006`) diverifikasi ulang terhadap berkas sumber asli (`02_Project_Master.csv`, `03_Project_Updates.csv`, `04_Production_Data.json`), termasuk:
  - Inkonsistensi aritmetika `PRJ-003` (`1,840 / 2,000 = 92.0%` vs `94.0%`) dan `PRJ-004` (`45,000 / 100,000 = 45.0%` vs `52.0%`).
  - Rekonsiliasi tahap workflow `PRJ-001` (`301.5 VERIFIED + 16.5 PENDING_INTERNAL_CHECK = 318.0 ML`).
  - Ketidaklayakan matematis `PRJ-002` (`32,760 / 4 hari = 8,190 pages/hari` vs batas maksimal normal `4,500 pages/hari`).
  - Gap validasi production `PRJ-005` (`9/10` dev vs `0/10` prod-tested dan `NOT_CONFIGURED`).
  - Verifikasi *no false alarm* pada `PRJ-006` (`COMPLETED` + `ONLINE` + `14` active users).
- **Verifikasi Eksekusi Nyata:** Menjalankan `npm test` (**124/124 test hijau** di 5 suite), `npm run verify -w backend` (**58/58 pemeriksaan rute, RBAC, dan integritas data lulus**), `npm run build` (TypeScript strict check backend & frontend lolos), serta regenerasi bukti di folder `proof/` via `npm run proof`.
- **Audit Bug & Perbaikan Mandiri:** Menemukan dan memperbaiki bug nyata selama uji coba langsung (terdokumentasi di [docs/BUG_LOG.md](docs/BUG_LOG.md)), antara lain *object spread* yang menghapus `Content-Type: application/json` saat header persona ditambahkan dan kebocoran angka KPI global (6 proyek) pada mode PIC.

## 4. Keputusan Engineering yang Diambil atau Ditolak
- **Ditolak — Menggunakan LLM/AI runtime untuk menilai status proyek:** Ditolak demi transparansi penuh (*explainability*), hasil deterministik, bebas halusinasi, dan nol ketergantungan API eksternal. Seluruh aturan `R1–R6` dibangun secara deterministik berbasis data.
- **Ditolak — *Hardcoding* skenario per `project_id`:** Ditolak keras; dibuktikan dengan test khusus `PRJ-999-CUSTOM` agar sistem siap menerima perubahan input (*Change Readiness*).
- **Ditolak — Menghitung laju historis `PRJ-003` menggunakan pembagi hari sampai `2026-10-06` (52 hari):** Disesuaikan agar proyek usang menghitung laju operasional sampai tanggal snapshot terakhir (`2026-09-30`, 46 hari = `40 boxes/hari`) dan menandai `INSUFFICIENT_DATA` untuk 6 hari terakhir, bukan mengasumsikan output 0.
- **Diambil — Pemisahan tegas `action_status` vs `verification_status` (Section 11):** Menutup follow-up (`RESOLVED`) secara otomatis masuk status `AWAITING_EVIDENCE` dan ditolak verifikasinya jika bukti operasional lebih tua dari `resolved_at`.
- **Diambil — `node:sqlite` bawaan Node.js:** Dipilih menggantikan driver native C++ agar bebas kegagalan *node-gyp* lintas OS saat evaluator menjalankan lokal.
