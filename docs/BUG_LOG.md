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
- **Gejala:** Pada sebagian lingkungan Windows, Vite default bind ke `localhost` (IPv6 `::1`) sehingga membuka `http://127.0.0.1:5173` bisa gagal tersambung atau tidak dapat diakses dari perangkat mobile di LAN.
- **Perbaikan:** Menetapkan `server: { host: true, port: 5173 }` dan proxy `/api` ke `http://127.0.0.1:4000` agar dapat diakses konsisten lewat `http://127.0.0.1:5173` maupun IP LAN.

---

### BUG-006 — Mengubah `Reported Actual` Tidak Otomatis Memperbarui `Reported Progress (%)` (`frontend/src/components/DataManagerView.tsx`)
- **Gejala:** Saat mengubah `reported_actual` pada `PRJ-005` (Kevin) dari `9` menjadi `5` (dari target `10`), kolom `Reported Progress (%)` tetap bertahan di `90%` kecuali tombol manual *"Hitung Otomatis %"* diklik.
- **Akar Masalah:** Handler `onChange` pada input `reported_actual` dan `target` hanya memperbarui field masing-masing tanpa menghitung ulang `reported_progress_pct`.
- **Perbaikan:** Menambahkan mode sinkronisasi otomatis (`autoCalcPct`, aktif secara default) sehingga setiap perubahan pada `reported_actual` atau `target` langsung menghitung ulang `reported_progress_pct = round((actual / target) * 100, 2)` secara real-time (`5 / 10` → langsung `50%`). Jika pengguna sengaja mengedit kolom `%` secara manual (misalnya untuk menguji aturan `R1_REPORT_MATH_MISMATCH`), mode berpindah ke `(Manual)` dan dapat dikembalikan ke `(Auto)` lewat tombol *"Hitung Otomatis %"*.

---

### BUG-007 — Tombol Back & Forward Mouse / Browser Tidak Berfungsi (`frontend/src/App.tsx`)
- **Gejala:** Saat berpindah dari Portfolio → Project Detail → Kelola Data, menekan tombol *Back* atau *Forward* pada mouse maupun browser tidak berpindah ke halaman sebelumnya/berikutnya.
- **Akar Masalah:** Navigasi sebelumnya hanya dikelola menggunakan React `useState` (`viewMode`, `selectedProjectId`) tanpa terhubung dengan Browser History API.
- **Perbaikan:** Menambahkan sinkronisasi *hash history* (`#/`, `#/projects/:id`, `#/data-manager`) menggunakan `window.history.pushState` / `replaceState` serta listener `popstate` dan `hashchange`, sehingga tombol Back/Forward mouse, Back/Forward browser, dan reload halaman (F5) bekerja penuh.
