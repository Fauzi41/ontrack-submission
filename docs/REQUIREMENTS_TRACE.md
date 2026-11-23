# OnTrack Project Intelligence — jejak kebutuhan

> Dokumen kerja pra-eksekusi. Tujuannya satu: klaim "tidak ada brief yang terlewat" harus bisa
> kamu periksa sendiri, bukan dipercaya begitu saja.
>
> Status: draf. Belum ada kode yang ditulis atas dasar dokumen ini.

---

## 0. Koreksi angka dari analisa sebelumnya

Di pass ketiga saya bilang ada "±60 butir eksplisit". Setelah menghitung ulang baris per baris untuk
file ini, jumlahnya 88. Selisihnya karena saya menghitung paragraf, bukan pernyataan yang bisa diuji
satu per satu. Angka yang dipakai sekarang yang di bawah ini.

| Kode | Arti | Jumlah |
|---|---|---|
| OK | Item rencana ada, plus cara memverifikasinya | 58 |
| PARSIAL | Item ada tapi berisiko dipotong | 1 |
| ARTEFAK | Dokumen atau slide yang belum ditulis, bukan kode | 21 |
| BATASAN | Brief bilang tidak perlu dibangun | 8 |
| HILANG | Belum ada item rencana | 0 |

---

## 1. Inventaris dokumen & otoritas

| File | Peran | Otoritas |
|---|---|---|
| `01_Candidate_Brief.docx/.pdf` | instruksi kandidat | **wajib**, sumber persyaratan utama |
| `06_Submission_Guide.txt` | checklist pengumpulan | **wajib** |
| `02_Project_Master.csv` | data input | **otoritatif** |
| `03_Project_Updates.csv` | data input | **otoritatif** |
| `04_Production_Data.json` | data input | **otoritatif** |
| `05_Data_Dictionary.pdf` | referensi struktur & semantik | **wajib dibaca** untuk semantik field |
| `07_OnTrack_Requirements_and_Data.xlsx` | referensi + template | BATASAN **bukan** sumber kebenaran keempat |

Aturan presedensi dari 06 baris 57 dan 07 `START_HERE`: CSV/JSON mengalahkan workbook. Workbook tidak
pernah jadi sumber nilai, cuma daftar periksa dan template skema.

---

## 2. Trace `01_Candidate_Brief`

| ID | Butir | Sumber | Status | Item rencana | Bukti |
|---|---|---|---|---|---|
| B01 | Sistem menjelaskan apa yang terjadi, mengapa penting, apa langkah berikutnya | L14 | OK | `finding.recommended_action` + `suggested_owner_role` (G1) | T-INT-11 |
| B02 | Peran: Full Stack Software Engineer (Builder) | L15 | BATASAN | konteks, tidak dibangun | — |
| B03 | Direktur tidak butuh dashboard penyalin laporan; butuh keadaan, perhatian, alasan, bukti, siapa bertindak | L16–17 | OK | Portofolio + G1 saran pemilik | M-DEMO |
| B04 | Positioning: lapisan intelijen, tidak menggantikan PM tool | L18 | BATASAN | konteks | — |
| B05 | Data bisa tidak lengkap/tidak sinkron; status laporan ≠ fakta final | L19 | OK | Invariant: `reported_status` bukan input detector (B5 pass-3) | T-INT-12 |
| B06 | Amati 6 proyek, telusuri multi-sumber, identifikasi perhatian, catat follow-up terlacak | L21 | OK | P1–P4 | M-DEMO |
| B07 | Rantai SOURCE→CONTEXT→EVIDENCE→INTERPRETATION→ATTENTION→FOLLOW-UP | L22 | OK | Lapisan data + UI 3 kolom | T-INT-01..14 |
| B08 | (1) Proyek apa yang sedang berjalan | L23 | OK | `lifecycle: ACTIVE/COMPLETED/PAST_DUE` (G12) | T-INT-13 |
| B09 | (2) Mana yang perlu perhatian dan mengapa | L23 | OK | 11 detector + `reason` | T-INT-01..10 |
| B10 | (3) Informasi apa yang mendukung penilaian | L23 | OK | `evidence_refs[]` per finding | T-INT-01 |
| B11 | (4) Apa yang belum diketahui / belum terverifikasi | L23 | OK | `unknowns[]` + `ThreeState` (G4) | T-INT-08 |
| B12 | (5) Tindakan apa, oleh siapa, status tindak lanjut | L23 | OK | G1 + `followups` | T-API-01 |
| B13 | Persona A: ringkasan, prioritas, alasan, akses cepat bukti, tak perlu baca raw update | L25 | OK | Portofolio + evidence drawer | M-DEMO |
| B14 | Persona B: konteks, pahami masalah, tambah catatan/follow-up, ubah status | L26 | OK | `finding_responses` (G3) + follow-up | T-API-04 |
| B15 | Alur minimal 7 langkah | L27 | OK | 3 layar | M-DEMO |
| B16 | Auth multi-role tidak wajib; jelaskan penanganan role di produk nyata | L28 | BATASAN | dijawab di README §Access | ARTEFAK |
| B17 | Semua file diproses sebagai input nyata; tanpa hardcode proyek/kesimpulan | L30 | OK | Importer generik + `project_type_rules` | M02, T-INT-10 |
| B18 | Tampilkan beda: dilaporkan / observasi sistem lain / interpretasi aplikasi | L31 | OK | `provenance: REPORTED/OPERATIONAL` + panel interpretasi | M-DEMO |
| B19 | Simpan/tampilkan rujukan jelas (`update_id`, `source_record_id`, `timestamp`, `source_type`) | L31 | OK | `observations.source_ref_id` + `observed_at` | M04 |
| B20 | Jangan menimpa nilai berbeda diam-diam; ketidakpastian eksplisit | L32 | OK | Kebijakan konflik §6 | T-INT-02 |
| B21 | Tetapkan & dokumentasikan as-of date | L33 | OK | `as_of = json.generated_at` | T-INT-09 |
| B22 | Tidak perlu streaming ingestion / integrasi API eksternal | L33 | BATASAN | tidak dibangun | — |
| B23 | P1 Portofolio: semua proyek, info inti, indikator perhatian, ringkasan untuk manajemen | §05 P1 | OK | + `narrative` 1 kalimat (G9) | M-DEMO |
| B24 | P2 Detail: master, update kronologis, data operasional, hubungkan kesimpulan→sumber | §05 P2 | OK | Semua baris sumber terjangkau | M04 |
| B25 | P3 Attention explainable; logika sendiri; alasan & bukti bisa diperiksa | §05 P3 | OK | Detector + `reason` + chip bukti | T-INT-01..10 |
| B26 | P4 Follow-up: buat, PIC/owner, deskripsi, due date opsional, ubah status, persisten, bisa dilihat lagi | §05 P4 | OK | `followups` + `followup_events` | T-API-01..03 |
| B27 | Status tindakan tidak otomatis membuktikan isu selesai | §05 P4 | OK | `issues.status` terpisah, re-evaluasi bukti | T-API-02 |
| B28 | P5 Refresh memproses perubahan tanpa menulis ulang logika per proyek | §05 P5 | OK | `POST /api/import` | M02 |
| B29 | P5 Jelaskan perilaku duplikat, data lebih lama, perubahan bertentangan | §05 P5 | OK | Kebijakan §6 + laporan impor | T-INT-06, M02 |
| B30 | P6 Resilience: input invalid/hilang ditangani dapat dijelaskan; tidak ada kesimpulan palsu | §05 P6 | OK | 3-level penanganan (baris/file/field) | T-INT-05 |
| B31 | Frontend & backend/API lokal | L42 | OK | Vite + Fastify | M01 |
| B32 | Persistence follow-up (SQLite/Postgres/ringan) | L42 | OK | SQLite | M01 |
| B33 | Data proyek boleh diimpor/dibaca dari file via backend | L42 | OK | `backend/data/` | M02 |
| B34 | ≥2 automated test bermakna: interpretasi/normalisasi + API/workflow; jelaskan cara jalan | L43 | OK | `interpret.test.ts`, `followups.api.test.ts` | `npm test` |
| B35 | Dokumentasi: arsitektur, struktur data, API, cara jalan, asumsi, prioritas, limitasi, trade-off | L44 | ARTEFAK | README §1–9 | ARTEFAK |
| B36 | `AI_USAGE.md`: alat, pekerjaan yang dibantu, bagian yang diverifikasi sendiri, keputusan diambil/ditolak | L45 | ARTEFAK | 4 bagian wajib | ARTEFAK |
| B37 | Prioritas: (1) kebenaran data+traceability+follow-up; (2) API/persistence/test/UX; (3) polish | L47 | OK | Urutan kerja §9 | — |
| B38 | Jangan habiskan waktu: login, animasi, AI, notifikasi, forecasting, pembayaran, deploy | L48 | PARSIAL | Lihat G13: proyeksi dijaga sebagai aritmetika, siap dilepas | — |
| B39 | Boleh menyederhanakan; tandai yang belum selesai + rencana perbaikan | L49 | ARTEFAK | README §Not done | ARTEFAK |
| B40 | D1 Source code + instruksi instalasi/jalan | D1 | ARTEFAK | `npm i && npm run dev` | M01 |
| B41 | D2 README: business interpretation, arsitektur, data flow, API, asumsi, limitasi, next steps | D2 | ARTEFAK | README §1–12 | ARTEFAK |
| B42 | D3 Test otomatis + perintah | D3 | OK | `npm test` | — |
| B43 | D4 `AI_USAGE.md` wajib walau tanpa AI | D4 | ARTEFAK | — | ARTEFAK |
| B44 | D5 Presentasi ≤10 slide: problem, data, pendekatan, arsitektur, demo, evidence, follow-up, testing, limitasi, roadmap | D5 | ARTEFAK | Peta slide §10 | ARTEFAK |
| B45 | D6 Jawaban 5 pertanyaan refleksi; screenshot bukan pengganti aplikasi | D6 | ARTEFAK | README §Refleksi | ARTEFAK |
| B46 | Presentasi ≤15 menit, untuk Direktur + engineer senior, jelas bagi bisnis tanpa kehilangan akurasi | L58 | ARTEFAK | Struktur naratif §10 | ARTEFAK |
| B47 | Q&A 15 menit; evaluator bisa minta penelusuran kode / demo perubahan input | L59 | OK | 3 skenario mutasi siap (M06) | M06 |
| B48 | Kandidat menentukan urutan presentasi sendiri | L60 | ARTEFAK | — | ARTEFAK |
| B49 | Maks 6 jam aktual; catat pembagian waktu di README/guide | L62 | ARTEFAK | README §Time allocation | ARTEFAK |
| B50 | Lebih dihargai prioritas masuk akal + transparansi daripada banyak fitur tak terverifikasi | L63 | OK | Cut list §11 | — |
| B51 | Kirim repo/arsip + presentasi + dokumen + instruksi; tanpa deploy publik; tanpa kredensial | L64 | ARTEFAK | manifest + lockfile | ARTEFAK |
| B52 | Tidak ada keharusan algoritma health scoring / teknologi / desain visual tertentu | L65 | BATASAN | — | — |
| B53 | Data sintetis, bukan data pelanggan nyata | L66 | BATASAN | tidak ada PII | — |
| B54 | Bedakan status aksi vs status isu; tautkan hasil follow-up ke bukti terbaru atau tandai belum terverifikasi; jelaskan batasan | §11 | OK | Siklus `issue.status` | T-API-02 |
| B55 | Logika menerima data baru/perubahan tanpa aturan per `project_id`; jelaskan dampak / modifikasi terbatas | §12 | OK | `project_type_rules` + laporan dampak (G2) | M03, M06 |
| B56 | Kandidat menentukan aturan prioritas, model data, cara menjelaskan ketidakpastian; jangan anggap setiap perbedaan sebagai kesalahan | L71 | OK | G3 `DISPUTED` + `explained_delta` | T-INT-03 |
| B57 | Dokumentasikan alasan keputusan + kondisi untuk ditinjau ulang | L71 | ARTEFAK | `Decision_Log` 6 kolom | ARTEFAK |

---

## 3. Trace `06_Submission_Guide`

| ID | Butir | Sumber | Status | Item rencana | Bukti |
|---|---|---|---|---|---|
| S01 | Frontend + backend berjalan lokal | baris 7 | OK | `npm run dev` | M01 |
| S02 | Persistence untuk follow-up & status | baris 8 | OK | SQLite | M01 |
| S03 | Proses CSV & JSON, bukan hasil hardcode | baris 9 | OK | Importer | M02 |
| S04 | Portofolio, detail, traceability bukti, penjelasan attention | baris 10 | OK | P1–P3 | M-DEMO |
| S05 | Buat/ubah/lihat follow-up | baris 11 | OK | P4 | T-API-01..03 |
| S06 | ≥2 test bermakna + instruksi | baris 12 | OK | `npm test` | — |
| S07 | README: install/run, arsitektur, API, data model, asumsi, limitasi, **alokasi waktu** | baris 13 | ARTEFAK | README §1–12 | ARTEFAK |
| S08 | `AI_USAGE.md` | baris 14 | ARTEFAK | — | ARTEFAK |
| S09 | `PRESENTATION.pdf`/`.pptx` ≤10 slide | baris 15 | ARTEFAK | — | ARTEFAK |
| S10 | Source + dependency manifest; instruksi seed/import | baris 16 | ARTEFAK | `package.json` + lockfile + §Seed | M02 |
| S11 | Isi presentasi: problem, journey, data sources, arsitektur, kesimpulan+bukti, follow-up, testing, trade-off, limitasi, next steps | baris 27–29 | ARTEFAK | Peta slide §10 | ARTEFAK |
| S12 | Jelaskan perbedaan **menutup follow-up** vs **memverifikasi isu selesai** | baris 29 | OK | Slide khusus + UI 2 badge | T-API-02 |
| S13 | 5 pertanyaan refleksi | baris 32–37 | ARTEFAK | README §Refleksi | ARTEFAK |
| S14 | Sesi lanjutan bisa memberi data berubah; tidak perlu menebak data tambahan | baris 54–55 | OK | 3 skenario + degrade aman (G7) | M06 |
| S15 | CSV/JSON otoritatif; workbook hanya referensi | baris 57 | BATASAN | — | — |

---

## 4. Trace `05_Data_Dictionary`

| ID | Butir | Sumber | Status | Item rencana | Bukti |
|---|---|---|---|---|---|
| D01 | Tiga sumber; granularitas; kunci relasi `project_id` | Overview | OK | Skema observations | — |
| D02 | Semantik & format field Project Master (tanggal `YYYY-MM-DD`, datetime) | §Project Master | OK | Parser tervalidasi | T-INT-05 |
| D03 | Field Project Updates; `source_type` enum (PM/OPERATOR/TECHNICAL_TEAM/ACCOUNT/VENDOR/FIELD_TEAM) | §Project Updates | OK | Dipetakan ke `REPORTED` + `Decision_Log` D-002 | T-INT-14 |
| D04 | Struktur root JSON: `generated_at` + `records[]` | §Production Data | OK | Anchor `as_of` | T-INT-09 |
| D05 | Nilai `source_system` & `record_type` | §Production Data | OK | Registry ekstraktor metrik | T-INT-01 |
| D06 | `verified_quantity` = state `VERIFIED`; `pending_internal_check_quantity` = state pending | §Operational Fields I | OK | Rekonsiliasi delta terjelaskan | T-INT-03 |
| D07 | Semantik scanner: `RUNNING` / `OUT_OF_SERVICE` / `LIMITED` (terbatas, bukan mati) | §Scanner status | OK | + `trend` (G5) | T-INT-07 |
| D08 | Unit: ML, pages, boxes, records, endpoints, system | §Formats & Units | OK | `unit` + larangan banding lintas unit | T-INT-04 |
| D09 | **CSV empty = nilai tidak tersedia; JSON `null` = field ada tanpa nilai tercatat** | catatan penutup | OK | `ThreeState` Present/KnownAbsent/NotProvided (G4) | T-INT-08 |
| D10 | Dataset reference date 06 Oktober 2026 | footer | OK | `as_of` default | T-INT-09 |

---

## 5. Trace `07_OnTrack_Requirements_and_Data.xlsx`

| ID | Butir | Sheet | Status | Item rencana | Bukti |
|---|---|---|---|---|---|
| W01 | P1–P6, T1–T4, D1 semua prioritas **Must** | `Requirements` | OK | sudah dipetakan B23–B34, B44 | — |
| W02 | Skema follow-up: `followup_id, project_id, title, description, owner, status, due_date, created_at, updated_at, **evidence_refs**` | `Followup_Template` | OK | `evidence_refs` disimpan saat dibuat | T-API-01 |
| W03 | `Decision_Log`: decision, why, alternatives, risk/trade-off, evidence/test | `Decision_Log` | ARTEFAK | README §Decision Log | ARTEFAK |
| W04 | `Presentation_Plan` 10 topik | `Presentation_Plan` | ARTEFAK | dasar peta slide | ARTEFAK |
| W05 | Closure & change: status aksi independen; isu tidak disimpulkan; tampilkan unknown; kebijakan refresh; as-of; live defence; presedensi input; ≤10 slide | `Closure_and_Change` | OK | sudah tercermin di §6 + B54/B55 | T-API-02 |
| W06 | Workbook bukan kunci jawaban; kolom kosong ≠ persyaratan hilang | `START_HERE` | BATASAN | dipatuhi | — |

---

## 6. Kebijakan data, ringkas sebagai acuan implementasi

| Situasi | Perilaku |
|---|---|
| Baris identik diimpor ulang | Diabaikan (idempoten), dihitung `duplicate` |
| `observed_at` lebih tua dari tersimpan | Tidak menimpa; ditandai `late_arrival` |
| Nilai berbeda pada timestamp sama | Keduanya disimpan; `source_conflict` muncul |
| Baris master duplikat (`project_id` sama) | Menang `last_reported_update_at` terbaru; konflik dilaporkan |
| Header CSV berubah / kolom wajib hilang | Pemetaan berbasis nama; error level file, state lama utuh |
| Metrik kumulatif menurun | `metric_regression`, tidak diterima diam-diam |
| Record koreksi | `supersedes_id`; record lama ditandai `superseded` |
| `project_id` tak dikenal | Orphan + dilaporkan; tidak membuat proyek hantu |
| Proyek hilang dari master | Tidak dihapus; ditandai tidak ada di impor terbaru |
| `project_type` tak dikenal | Default `flow` + catatan "basis belum dikonfigurasi" (G7) |

---

## 7. Audit data: hasil hitung ulang (`02`, `03`, `04`)

| Proyek | `rep%` | `calc%` (actual/target) | Δ | Produksi (bukti) | Gap vs laporan | Laju tercapai | Laju dibutuhkan sisa | Rasio | Metode kedua setuju? |
|---|---|---|---|---|---|---|---|---|---|
| PRJ-001 | 79,50 | 79,50 | 0,00 | 301,5 ML verified (+16,5 pending) | +16,5 (terjelaskan) | 9,1/hari | 8,8/hari | 0,97 | **borderline** |
| PRJ-002 | 76,25 | 76,25 | 0,00 | 87.240 pages | +4.260 (tak terjelaskan) | 3.519/hari | 6.642/hari | 1,89 | ya — tertinggal |
| PRJ-003 | **94,00** | **92,00** | **+2,00** | 1.840 boxes | 0 | 35,4/hari | 11,2/hari | 0,32 | ya, aman |
| PRJ-004 | **52,00** | **45,00** | **+7,00** | 45.000 records (+3.200 skipped) | 0 / 3.800 tak terjelaskan | 1.286/hari | 1.816/hari | 1,41 | ya — tertinggal |
| PRJ-005 | 90,00 | 90,00 (developed) | 0,00 | **0 endpoint production-tested** | +9 | n/a (diskrit) | n/a | n/a | tidak sah |
| PRJ-006 | 100,00 | 100,00 | 0,00 | online, 14 user aktif | — | n/a | n/a | — | selesai |

Empat kelas cacat yang tidak kelihatan kalau cuma membaca:

1. Aritmetika internal. PRJ-003 meleset +2,00 pp dan PRJ-004 +7,00 pp dari hitungan `actual/target`. Untuk PRJ-004, residu 3.800 record tetap tak terjelaskan setelah 3.200 record yang di-skip ikut dihitung (48,2% ≠ 52%).
2. Definisi progress. PRJ-005 tercatat 90% developed, tapi production-tested 0% (`API-EPS-001`). `connection_status: NOT_CONFIGURED` dan `last_successful_connection: null`, yang oleh tri-state dibaca sebagai KnownAbsent alias bukti positif.
3. Model proyeksi tidak sah. Laju 0,257 endpoint/hari di PRJ-005 bukan throughput, melainkan kebalikan dari waktu tunggu. Proyeksi linear di atasnya menghasilkan angka sampah. Karena itu ada gerbang `rate_model`.
4. Waktu versus status. PRJ-006 punya deadline 30 Sep dan `as_of` 6 Okt (6 hari kalender), statusnya COMPLETED dengan deployment 30 Sep 16:05. Artinya selesai tepat waktu. Aturan `OVERDUE` wajib melihat status.

Catatan presisi: selisih hari PRJ-006 adalah 6 hari kalender, bukan 7. Angka −7 sebelumnya datang dari pembulatan ke bawah `timedelta` yang masih mengandung jam.

---

## 8. Sumbu use case & aturan yang mengikat

| Sumbu | Aturan ringkas |
|---|---|
| **Tie antar-proyek** | severity → time_pressure → confidence → deadline terawal → gap tak terjelaskan → `project_id`. Seri pada 5 kunci pertama → **peringkat sama, ditandai seri** |
| **Tie dalam proyek** | Finding yang berbagi `evidence_ref` digabung ke `finding_group_id`; severity grup = tertinggi anggotanya |
| **Severity × confidence** | `critical` + `low` → turun satu tingkat + badge "belum terverifikasi"; tidak pernah dibuang |
| **Deadline** | `OVERDUE / DUE_TODAY / DUE_SOON / APPROACHING / DISTANT / UNKNOWN`; COMPLETED tidak pernah OVERDUE; deadline = akhir hari, zona Asia/Jakarta, hari kalender |
| **Tidak dapat dinilai** | Bucket `UNRANKED` terpisah, **tidak** digabung ke "aman" |
| **Delta** | Terjelaskan 100% → `watch`; sebagian → `attention`; tidak terjelaskan → `critical` |
| **Trend** | `improving / worsening / stable / volatile` dari ≥2 observasi; severity pakai kondisi terkini + arah |
| **Kapasitas** | Tidak menurunkan throughput berdasarkan jumlah unit rusak. Pakai angka yang dilaporkan |
| **Follow-up** | `owner_kind: internal/vendor/customer`; aksi DONE ≠ isu resolved; reopen menambah `reopen_count` |
| **Presisi** | Kuantitas disimpan sebagai integer terskala (×10); tidak membandingkan float langsung |

---

## 9. Peta persyaratan ke test

| Test | File | Cakupan |
|---|---|---|
| T-INT-01..14 | `tests/interpret.test.ts` | delta terjelaskan vs tidak · konflik timestamp sama · D9 (+7,00 PRJ-004) · unit tidak sebanding · field hilang/null · record lebih tua · tie → seri · low-confidence downgrade · as-of · tipe tak dikenal · saran aksi/pemilik · `reported_status` bukan input · lifecycle · provenance `source_type` |
| T-API-01..06 | `tests/followups.api.test.ts` | create → list → PATCH → riwayat · **assert isu belum resolved** → ingest bukti → `VERIFIED_RESOLVED` · owner kosong 400 · PATCH idempoten · 404 · validasi status |
| M01 | manual | restart server → follow-up masih ada (T2) |
| M02 | manual | impor 2× → 0 insert; laporan duplikat |
| M03 | manual | laporan dampak before/after setelah mutasi |
| M04 | manual | Source Inventory: 6 proyek / 23 update / 12 record cocok dengan file |
| M05 | manual | `?as_of=2026-10-05` menyembunyikan observasi 6 Okt |
| M06 | manual | 3 skenario: bukti baru · bukti dicabut · angka berubah |

---

## 10. Definisi selesai & hal yang dinyatakan terbuka

Yang harus jalan: impor generik, portofolio dengan lifecycle dan narasi, detail tiga
lapis, 11 detector plus trend dan tri-state, follow-up dengan aksi dan isu terpisah, saran aksi serta
pemilik, sanggahan finding, laporan dampak impor, Source Inventory, dua test dengan tabel kasus,
README, AI_USAGE, dan 8–10 slide.

Yang saya nyatakan terbuka di README, bukan sembunyikan: ekstraksi angka dari teks bebas update,
kalender hari kerja, autentikasi multi-role, perilaku di skala 500 proyek, dan notifikasi.

Kalaupun waktu mepet, urutan potongnya trend dulu, lalu narasi manajemen, terakhir granularitas saran
pemilik. Lima hal yang tidak boleh dipotong: laporan dampak (G2), sanggahan finding (G3), tri-state
null (G4), Source Inventory (G6), dan pemisahan aksi dari isu (B27/B54).

---

## 11. Butir yang masih hilang

Tidak ada satu pun yang tersisa. Setiap butir eksplisit di keenam dokumen sudah punya item rencana,
artefak terjadwal, atau batasan yang dipatuhi.

Satu hal yang tidak bisa saya klaim: bebas risiko implementasi. Baris PARSIAL menandai tempat di
mana rencananya ada tapi hasilnya bisa salah bentuk atau kena potong. Itu risiko eksekusi, bukan
brief yang terlewat.

---

## 12. Blok persetujuan

- [x] Jumlah butir & klasifikasi status disetujui
- [x] Prioritas §10 disetujui (terutama urutan potong)
- [x] Stack §rencana disetujui
- [x] Boleh mulai eksekusi, **dibatasi sampai fase 2** atas instruksi

Setelah dicentang, dokumen ini menjadi baseline: setiap penyimpangan dicatat sebagai
`Decision_Log` baru dengan kondisi peninjauan ulang.

---

## 13. Status eksekusi

| Fase | Status | Bukti |
|---|---|---|
| 0 Baseline | OK | `git init`, `.gitignore`, jam mulai dicatat `2026-11-22T15:20:50Z` |
| 1 Kerangka | OK | Fastify :3001 + Vite :5173 + SQLite; `GET /healthz` → `{"ok":true,...}` |
| 2 Skema + importer | OK | 6 proyek · 23 update · 12 produksi · 41 source record · 92 nilai observasi |
| 3 Detector | OK | 12 detektor, 15 temuan, output CLI di `npm run evaluate -w backend` |
| 4 API | OK | 16 rute; isu, follow-up, tanggapan, dan dampak impor tersimpan di DB |
| 5 UI | OK | empat tampilan: portofolio berperingkat, detail proyek, antrean tinjauan, sumber data |
| 6 Test | OK | 124 test di 8 berkas + skrip `npm run verify` (58 pemeriksaan rute dan integritas data) |
| 9 Slide presentasi | OK | `docs/presentation.html` (10 slide bahasa Inggris) + `docs/PRESENTATION.pdf` |
| 7 Proof pack | OK | `scripts/proof.sh` membangun ulang semua bukti; `docs/PROOF_PACK.md` memetakan klaim ke berkas |
| 8 Dokumen | OK | `README.md`, `docs/DECISION_LOG.md` (17 keputusan), `docs/AI_USAGE.md`, `docs/BUG_LOG.md` (14 bug) |
| 10 Dry run | OK | klon bersih: `npm install` 283 paket, 115 test, 50/50 verifikasi, impor 41 baris, build 165,69 kB, antarmuka terbuka di port 3011 |

Bukti fase 5, diperiksa lewat browser pada `http://127.0.0.1:5173`:

- Portofolio menampilkan urutan mesin: PRJ-002, PRJ-005, PRJ-004 kritis; PRJ-001 perhatian;
  PRJ-003 pantau; PRJ-006 tanpa peringkat. Angka kritis, perhatian, pantau, dan isu terbuka
  diambil dari jawaban API, bukan dihitung ulang di layar.
- Detail PRJ-002 menampilkan dua persentase yang berbeda: 76,3% menurut laporan dan 72,7%
  dari bukti tervalidasi. Selisih 4.260 halaman muncul di temuan, bukan disembunyikan.
- Bukti tiap temuan tampil sebagai chip berisi `ref_id`, label, provenance, dan waktu observasi.
- Tombol "Menunggu bukti" mengubah status isu dan memunculkan konfirmasi di layar.
- Penutupan isu dengan record lama dijawab di layar: "Record SCAN-BETA-001 sudah ada saat isu
  dibuka, jadi tidak bisa dipakai sebagai bukti perbaikan." Pesannya datang dari API, bukan
  ditulis ulang di frontend.
- Follow-up baru dibuat dari formulir, lalu ditandai selesai; layar menampilkan
  "Status DONE dicatat. Isu tidak berubah." dan jumlah isu terbuka tidak bergerak.


Bukti fase 4, dijalankan pada server yang hidup di `http://127.0.0.1:3001`:

- `POST /api/import` → `inserted: 0, duplicates: 41, findings_impact.opened: 0, issues_sync.opened: 14`
  pada basis data yang sudah terisi; impor pertama menghasilkan 14 isu dari 14 temuan non-info
- `GET /api/portfolio` → peringkat 1 PRJ-002 kritis, `issue_counts` dihitung dari tabel, bukan ditebak
- `POST /api/projects/PRJ-002/followups` → `201`, peristiwa `CREATED` tercatat dengan nama pelakunya
- `PATCH /api/followups/:id` status `DONE` → jawaban memuat kalimat bahwa status follow-up tidak
  mengubah status isu, dan `issue_counts` tidak bergerak
- Penutupan isu: tanpa `evidence_ref` dijawab `422 EVIDENCE_REQUIRED`; dengan record lama
  (`SCAN-BETA-001`, masuk sebelum isu dibuka) dijawab `409 EVIDENCE_STALE`; `AWAITING_EVIDENCE`
  diterima dan bertahan setelah impor ulang

Tiga keputusan yang lahir di fase ini:

- **D-004 Penutupan isu butuh bukti baru.** `VERIFIED_RESOLVED` hanya diterima bila ada record
  sumber milik proyek yang sama dan masuk setelah isu dibuka. Ini menutup celah "follow-up selesai
  berarti isu beres" tanpa bergantung pada disiplin pengguna.
- **D-005 Temuan `info` bukan isu.** Hanya severity `watch` ke atas yang membuka baris di tabel
  `issues`. Proyek yang selesai dengan bukti tetap punya temuan informasi, tapi tidak menambah
  beban tindak lanjut.
- **D-006 Impor melaporkan dua jenis dampak.** Dampak proyek (field apa yang berubah) dan dampak
  temuan (apa yang lahir, hilang, naik, atau turun). Tanpa yang kedua, laporan impor hanya
  menghitung baris.


Bukti fase 3, dijalankan sendiri:

- Portofolio: PRJ-002 kritis · PRJ-005 kritis · PRJ-004 kritis · PRJ-001 perhatian (borderline) ·
  PRJ-003 pantau · PRJ-006 info
- PRJ-002 menghasilkan tiga temuan yang digabung jadi satu kelompok lewat bukti yang sama
  (`SCAN-BETA-001`), bukan tiga baris terpisah di daftar
- PRJ-005 menolak menghitung laju: tipe `System Integration` punya `rate_model = discrete`
- PRJ-006 terbaca "selesai tepat waktu" karena yang dibandingkan dengan deadline adalah
  `deployment_status` 30 Sep 16:05, bukan pemeriksaan kesehatan 6 Okt
- `record_versions` terbukti: `SUPERSEDED` menahan isi lama saat record diubah, `LATE_ARRIVAL`
  menyimpan versi lebih tua tanpa menimpa record aktif

Dua koreksi yang muncul setelah melihat output, bukan setelah menulis kode:

- `source_conflict` sempat menyala di PRJ-005 (9 dibangun vs 0 diuji). Itu bukan dua sumber
  berselisih, melainkan dua definisi. Sekarang detektor itu dimatikan untuk
  `progress_basis = accepted_in_production` dan kasusnya ditangani `progress_basis_conflict`.
- `schedule_risk` sempat memberi PRJ-001 severity kritis karena basis tervalidasi 1,26x, padahal
  basis laporan 0,99x. Kalau dua basis yang sah berbeda kesimpulan, severity dibatasi ke perhatian
  dan temuan ditandai borderline.

Bukti fase 2, saya jalankan sendiri:

- Impor pertama → `inserted: 41, rejected: 0, issues: 0`
- Impor kedua (idempoten) → `inserted: 0, duplicates: 41`
- `as_of` = `2026-10-06T17:00:00`, diambil dari `generated_at` JSON dan bukan tanggal hari ini
- Tri-state terbukti: `PRJ-005 / last_successful_connection` tersimpan `KNOWN_ABSENT`,
  bukan `NOT_PROVIDED`. Kasus inilah yang paling menentukan severity PRJ-005
- Provenance terpisah: 12 `OPERATIONAL` (JSON) melawan 29 `REPORTED` (6 master + 23 update)

Catatan keputusan yang masuk `Decision_Log`:

- **D-001** `better-sqlite3` dipakai, cadangan `node:sqlite` tidak perlu karena binary prebuilt
  berhasil dikompilasi di Node 24.
- **D-002** `source_type` pada updates (OPERATOR/VENDOR/…) tetap dipetakan ke `REPORTED`, bukan
  `OPERATIONAL`, sebab itu laporan manusia meski bahasanya teknis.
- **D-003** `as_of` diambil dari `generated_at` JSON, bukan `max(observed_at)`, supaya analisis tidak
  bisa digeser oleh record bertanggal masa depan.


## Kesesuaian dengan daftar serah-terima (06_Submission_Guide)

| Butir | Status | Bukti |
|---|---|---|
| Frontend dan backend/API berjalan lokal | OK | `npm run dev -w backend`, `npm run dev -w frontend`, dan `npm start -w backend` menyajikan keduanya dari satu port |
| Persistensi follow-up dan status | OK | tabel `followups`, `followup_events`, `issues`; bertahan lintas restart |
| Memproses CSV dan JSON, tidak hardcode per proyek | OK | `grep -rn "PRJ-00" backend/src` hanya menemukan skrip verifikasi, bukan jalur produk |
| Portofolio, detail proyek, jejak bukti, penjelasan perhatian | OK | tiga tampilan; setiap temuan membawa daftar record |
| Buat, ubah, lihat follow-up | OK | rute `POST/GET /api/projects/:id/followups`, `GET/PATCH /api/followups/:id`, dan panel di layar detail |
| Minimal dua test otomatis dan cara menjalankannya | OK | 124 test di 8 berkas, dicetak `npm test` |
| README: pasang, arsitektur, API, model data, asumsi, batas, alokasi waktu | OK | `README.md` bagian Menjalankan, Struktur, API, Model data, Asumsi, Alokasi waktu, Batas |
| AI_USAGE.md | OK | `AI_USAGE.md` di akar repositori |
| PRESENTATION.pdf maksimal 10 slide | OK | `docs/PRESENTATION.pdf`, sepuluh halaman, bahasa Inggris |
| Kode sumber dan manifes dependensi | OK | `package.json`, `package-lock.json` di akar dan dua workspace |
| Instruksi impor | OK | tombol impor di layar Sumber data, `npm run import -w backend`, dan `bash scripts/proof.sh` |
| Lima pertanyaan refleksi | OK | `docs/REFLECTION.md` |
