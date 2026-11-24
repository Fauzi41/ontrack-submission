# Five Reflection Questions (Deliverable D6)

---

### 1. Which parts of the source data are reports, which are operational evidence, and how do you distinguish them?

- **Reports (Human / Management Claims):**
  - `02_Project_Master.csv`: ringkasan periodik yang diisi/dikelola PIC (`reported_actual`, `reported_progress_pct`, `reported_status`, `last_reported_update_at`). Ini adalah **klaim status**, bukan bukti final.
  - `03_Project_Updates.csv`: pesan tekstual dari `PROJECT_MANAGER`, `ACCOUNT`, `OPERATOR`, `FIELD_TEAM`, `TECHNICAL_TEAM`, dan `VENDOR`. Walaupun `OPERATOR`/`FIELD_TEAM`/`VENDOR` lebih dekat ke realitas lapangan dibanding ringkasan PM, semuanya tetap diklasifikasikan sebagai **human updates / narrative reports** karena bersifat subjektif dan tidak terstruktur.
- **Operational Evidence (System Telemetry / Machine Observations):**
  - `04_Production_Data.json`: snapshot langsung dari sistem operasional (`archive_production_report`, `scanner_production_log`, `warehouse_entry`, `verification_application`, `api_monitor`, `dms_monitor`) lengkap dengan `source_record_id`, `record_type`, `timestamp`, dan metrik terukur (`verified_quantity`, `pending_internal_check_quantity`, `pages_processed_total`, `scanners[]`, `records_skipped_missing_region`, `production_tested_endpoints`, `connection_status`, `active_users_last_24h`).
- **Cara Sistem Membedakannya:**
  - Di **database**: disimpan di tiga tabel terpisah (`source_masters`, `source_updates`, `source_production`) dengan `payload_hash` dan kunci asal masing-masing.
  - Di **API & UI**: dipisahkan eksplisit melalui tiga kartu perbandingan (*Reported Master* vs *Operational Evidence* vs *System Interpretation*), badge warna berbeda (`PROJECT_MASTER`, `PROJECT_UPDATE`, `PRODUCTION_EVIDENCE`), serta filter terpisah pada *Unified Timeline*.

---

### 2. When two sources differ, how does your system avoid making an unjustified claim?

1. **Never Silently Overwrite:** Sistem selalu mempertahankan dan menampilkan kedua nilai berdampingan lengkap dengan `ref_id` dan `timestamp` (misalnya `PRJ-002`: Master `91,500 pages @ 2026-10-06T08:10` vs Log `87,240 pages @ 2026-10-05T23:59`, selisih `4,260 pages` dengan jarak waktu `8.18 jam`).
2. **Distinguish Definition Differences from Unexplained Discrepancies:** Sistem tidak menganggap semua selisih sebagai kesalahan/kecurangan. Pada `PRJ-001`, aturan `R2A_WORKFLOW_STATE_GAP` mengecek `verified_quantity (301.5) + pending_internal_check_quantity (16.5) == reported_actual (318.0)`, sehingga secara akurat melabelinya sebagai **perbedaan definisi tahap workflow** yang terkonfirmasi oleh `UPD-009`, bukan kesalahan pelaporan.
3. **Explicit Uncertainty over False Certainty:** Pada `PRJ-003` (data usang 6 hari), sistem menolak menyimpulkan proyek "ON TRACK" maupun "DELAYED". Sebaliknya, sistem menetapkan `feasibility_verdict = INSUFFICIENT_DATA`, `uncertainty_level = HIGH`, dan mendaftarkan ketidakpastian di panel *Unknowns*.
4. **Immutable Conflict Handling saat Refresh:** Jika *refresh* membawa `update_id` atau `source_record_id` yang sama tetapi isi payload berbeda, sistem **tidak** menimpa histori secara diam-diam melainkan menandai `CONFLICTING_DUPLICATE_*` di log audit ingestion.

---

### 3. What would break first if the system handled 500 projects and daily updates? Why?

1. **On-the-Fly Portfolio Recomputation (`GET /api/portfolio` — Pola N+1 / >501 Kueri):** Saat ini endpoint portofolio menjalankan 1 kueri daftar master diikuti kueri anak per proyek (updates, production records, follow-ups) lalu menghitung ulang seluruh sinyal dan timeline pada setiap *request*. Pada 500 proyek × 365 hari (~180.000+ update & snapshot), jumlah kueri melonjak melampaui 501 kueri per request dan latensi/memori akan meningkat drastis *(catatan jujur: angka >501 kueri diturunkan dari analisis struktural kode dan belum diuji beban secara langsung)*. **Solusi:** hitung dan *cache/materialize* proyeksi `project_intelligence_snapshots` secara inkremental saat ingestion (event-driven per `project_id` yang berubah), plus paginasi & indeks komposit `(project_id, timestamp)`.
2. **SQLite Single-Writer Lock & File-Based Refresh:** SQLite dengan satu penulis akan mengalami *write contention* saat banyak sistem sumber melakukan *concurrent push* sekaligus, dan pemindaian ulang seluruh file CSV/JSON penuh dari disk akan menjadi lambat. **Solusi:** migrasi ke PostgreSQL dengan *incremental cursor/watermark ingestion* (hanya memproses delta sejak `last_ingested_at`).
3. **Regex-Based Field Signal Extraction (`R4D`) & Cumulative Average Run-Rate:** Pada 500 proyek beragam, pesan bebas dari ratusan operator akan memunculkan variasi bahasa/singkatan yang memicu *false negative/positive* pada regex, dan rata-rata kumulatif sejak `start_date` menjadi kurang responsif untuk proyek berdurasi panjang. **Solusi:** formulir terstruktur untuk *blocker tags* + *rolling 7-day velocity* dari data *time-series* harian.

---

### 4. How does a manager know who owns a follow-up, whether the action is closed, and whether the underlying issue is actually resolved?

Sistem memisahkan tiga dimensi tersebut secara eksplisit di skema database (`follow_ups` + `follow_up_history`), API, dan tampilan UI:
1. **Ownership:** Setiap follow-up wajib memiliki field `owner` (PIC penanggung jawab), `due_date`, `priority`, dan `linked_signal_code`, serta mencatat histori perpindahan owner bila dialihkan.
2. **Action Closure (`action_status`):** Menunjukkan status pekerjaan administratif/lapangan (`OPEN` → `IN_PROGRESS` → `RESOLVED` / `CANCELLED`), lengkap dengan timestamp `resolved_at` dan catatan auditor di `follow_up_history`.
3. **Underlying Issue Verification (`verification_status` + Independent Rule Engine):**
   - Begitu follow-up diubah ke `RESOLVED`, `verification_status` **otomatis** diset ke **`AWAITING_EVIDENCE`** (banner amber: *"Action Closed ≠ Operational Issue Resolved"*).
   - Sinyal perhatian proyek (`signals[]`) **tetap aktif** selama bukti operasional di `source_production` belum membaik.
   - Masalah baru berstatus **`VERIFIED_BY_EVIDENCE`** setelah ada record operasional baru di `Production Data` dengan **`timestamp >= resolved_at`** yang ditautkan via `POST /api/followups/:id/verify` (bukti lebih lama dari `resolved_at` ditolak sistem), dan mesin aturan secara independen memverifikasi hilangnya sinyal setelah data di-*refresh*.

---

### 5. With two more days, what would you improve first and why?

1. **Materialized Project Snapshots + Rolling 7-Day Velocity Charts (Hari 1 Pagi):** Mengganti kalkulasi *on-the-fly* dengan tabel proyeksi terindeks agar siap skala 500+ proyek, sekaligus menambahkan grafik tren *burn-up* harian agar manajemen langsung melihat perubahan kecepatan produksi (misalnya dampak rusaknya Scanner B pada `PRJ-002` secara visual).
2. **Automated Signal-to-Follow-Up Reconciliation & Configurable Rule Thresholds (Hari 1 Siang):** Menyimpan konfigurasi ambang batas (misal batas *staleness* 72 jam, toleransi selisih 0.5%, bobot risiko) di tabel konfigurasi agar operasional bisa menyesuaikan per `project_type`, serta otomatis menandai follow-up `AWAITING_EVIDENCE` sebagai *"Ready for Verification"* begitu *ingest* baru menghilangkan `linked_signal_code`.
3. **RBAC + Authenticated Audit Identity + E2E Browser Tests (Hari 2):** Menambahkan autentikasi minimal (*Director* vs *PM* vs *Ingestion Service*) agar `actor` di `follow_up_history` tervalidasi dan *separation of duties* pada verifikasi bukti berjalan ketat, disertai *end-to-end Playwright test* untuk alur UI penuh.
