# Bug & Fix Log (`BUG_LOG.md`)

Catatan bug nyata yang ditemukan selama pembangunan, pengujian, dan uji interaktif **OnTrack Project Intelligence**, beserta akar masalah dan verifikasi perbaikannya.

---

### BUG-001 — Strict TypeScript Control-Flow Narrowing pada `dmsStatus` (`backend/src/intelligenceEngine.ts`)
- **Gejala:** `tsc -p tsconfig.json` gagal dengan error `TS2339: Property 'deployment_status' does not exist on type 'never'` saat menggabungkan dua snapshot `dms_monitor` (`DMS-ZETA-001` dan `DMS-ZETA-002`).
- **Akar Masalah:** Variabel `let dmsStatus: OperationalSummary['dms_status'] = null` diinisialisasi `null` sebelum loop, sehingga TypeScript menyempitkan referensi `dmsStatus?.deployment_status` di sisi kanan penugasan menjadi `never`.
- **Perbaikan:** Menyimpan snapshot sebelumnya melalui `const prevDms = dmsStatus as OperationalSummary['dms_status']` sebelum menyusun objek gabungan terbaru.
- **Verifikasi:** `npm run build -w backend` keluar `0`; `PRJ-006` menggabungkan `deployment_status: COMPLETED` (`DMS-ZETA-001`) dengan `active_users_last_24h: 14` (`DMS-ZETA-002`) dengan akurat (`tests/intelligenceEngine.test.ts` #11–#12).

---

### BUG-002 — Object Spread Order Menghapus `Content-Type: application/json` (`frontend/src/api.ts`)
- **Gejala:** Saat menyimpan snapshot bukti operasional baru dari dashboard `Kelola Data`, backend mengembalikan `400 Validation failed` dengan seluruh field (`project_id`, `source_system`, `record_type`, `timestamp`, `metrics`) dilaporkan `"Required"`.
- **Akar Masalah:** Pada fungsi `requestJson()`, penulisan:
  ```ts
  fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  ```
  menyebabkan `...init` menimpa property `headers` setiap kali `init.headers` diisi (yaitu saat header persona `X-Actor-Role` / `X-Actor-Name` ditambahkan), sehingga `Content-Type: application/json` hilang dan `express.json()` tidak mem-parse body JSON.
- **Perbaikan:** Membalik urutan menjadi `...init` terlebih dahulu, kemudian `headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) }`.
- **Verifikasi:** `POST /api/data/production` pada `PRJ-005` berhasil menyimpan snapshot `PROD-UI-*` (`201 Created`) dan langsung memperbarui kalkulasi di UI.

---

### BUG-003 — Kebocoran Angka KPI Global (6 Proyek) pada Mode Persona PIC (`frontend/src/components/PortfolioView.tsx` & `backend/src/app.ts`)
- **Gejala:** Saat berpindah ke persona **`PIC — Andi`** (hanya memiliki 1 proyek: `PRJ-003`), kartu KPI di dashboard dan badge angka filter tab masih menampilkan angka global **`6` proyek** (`2 Kritis`, `3 Tinggi`, dst.), serta endpoint `GET` backend belum memblokir akses lintas PIC.
- **Akar Masalah:** `GET /api/portfolio` sebelumnya selalu mengagregasi KPI dari seluruh master di database, dan `PortfolioView.tsx` membaca `portfolio.kpis` global bukan proyek milik PIC aktif.
- **Perbaikan:**
  1. `GET /api/portfolio` memfilter master sesuai `X-Actor-Role`/`X-Actor-Name` **sebelum** menghitung `projects` dan `kpis` (sambil tetap menyertakan `available_pics[]` agar switcher header tetap utuh).
  2. `GET /api/projects/:id`, `GET/POST/PATCH /api/followups`, `GET /api/ingestion/runs`, dan seluruh endpoint mutasi `/api/data/*` menegakkan kepemilikan proyek PIC (`403 Forbidden` jika mengakses proyek PIC lain).
  3. `PortfolioView.tsx` menghitung KPI & filter tab dari data ter-scope dan menghapus tombol *"Lihat Semua Proyek"* pada mode PIC.
- **Verifikasi:** `tests/api.test.ts` (#15–#20) & `verify.ts` (#51–#58): `PIC Andi` melihat tepat `kpis.total_projects = 1` (`PRJ-003`) dan ditolak `403` saat mencoba membaca/mengubah `PRJ-006` (Maya).

---

### BUG-004 — Akses Reset Dataset pada Mode PIC Terblokir Total Sebelum Mendukung *Scoped Reset* (`backend/src/db.ts` & `backend/src/app.ts`)
- **Gejala:** PIC yang telah mengedit data proyeknya sendiri di dashboard `Kelola Data` tidak dapat mengembalikan proyeknya sendiri ke data awal tanpa beralih ke Director, karena `POST /api/data/reset` sebelumnya hanya mendukung reset portofolio penuh.
- **Akar Masalah:** Belum tersedia metode reset per `project_id` yang mengembalikan nilai asli dari file `/data` tanpa menyentuh proyek PIC lain.
- **Perbaikan:** Menambahkan `db.resetProjectsToAuthoritativeData(dataDir, projectIds, resetFollowUps)` dan opsi `scope: 'OWN'` pada `POST /api/data/reset` sehingga PIC dapat mereset proyek miliknya sendiri kembali ke data awal (bukan kosong), sementara `scope: 'ALL'` atau `projectId` milik PIC lain tetap ditolak `403 Forbidden`.
- **Verifikasi:** `tests/api.test.ts` (#19) & `verify.ts` (#57).

---

### BUG-005 — Inkonsistensi Binding `localhost` vs `127.0.0.1` pada Vite Dev Server (`frontend/vite.config.ts`)
- **Gejala:** Pada sebagian lingkungan Windows, Vite default bind ke `localhost` (IPv6 `::1`) sehingga membuka `http://127.0.0.1:5173` bisa gagal tersambung.
- **Perbaikan:** Menetapkan `server: { host: '127.0.0.1', port: 5173 }` dan proxy `/api` ke `http://127.0.0.1:4000` agar instruksi pembukaan `http://127.0.0.1:5173` konsisten di semua mesin.
