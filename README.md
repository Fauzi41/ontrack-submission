# OnTrack Project Intelligence

Alat baca portofolio proyek yang menolak menampilkan angka yang tidak bisa dipertanggungjawabkan. Ia membaca berkas sumber, mencari pertentangan di dalamnya, menaruh temuan pada urutan yang bisa diperiksa, lalu hanya mengizinkan sebuah isu ditutup kalau ada bukti baru.

Data contoh: enam proyek arsip dan digitalisasi milik PT Tata Solusi Digital.

## Menjalankan

Kebutuhan: Node 24 atau lebih baru, npm 12.

```bash
npm install
```

npm 12 memblokir skrip instalasi dependensi secara bawaan. Kalau `better-sqlite3` gagal dibangun, izinkan lalu bangun ulang:

```bash
npm install-scripts approve better-sqlite3
npm rebuild better-sqlite3
```

Nyalakan dua proses di terminal terpisah:

```bash
npm run dev -w backend     # API di http://127.0.0.1:3001
npm run dev -w frontend    # antarmuka di http://127.0.0.1:5173
```

Buka `http://127.0.0.1:5173`, lalu tekan tombol impor. Basis data dibuat otomatis di `backend/data/ontrack.db`.

## Yang dibuat

Rantainya lima langkah, dan setiap layar memperlihatkan langkah mana yang sedang dilihat.

Sumber. Enam baris master, 23 update mingguan, dan 12 record operasional dari sistem scanner, gudang, API, dan DMS. Setiap baris menyimpan asalnya, kapan diamati, dan kapan masuk. CSV dan JSON adalah sumber otoritatif. Excel hanya dipakai sebagai pembanding saat membaca brief.

Konteks. Deadline, tipe proyek, dan basis progress menentukan cara sebuah angka boleh ditafsirkan. Proyek digitalisasi dihitung dari halaman yang tervalidasi. Proyek integrasi dihitung dari endpoint yang diterima di production. Aturan ini data, bukan cabang `if` di dalam kode.

Bukti. Angka laporan dan angka operasional disimpan terpisah dan tidak pernah dijumlahkan menjadi satu persentase. Layar menampilkan keduanya berdampingan, karena selisih di antara keduanya justru temuannya.

Interpretasi. Empat belas jenis detektor berjalan di atas konteks dan bukti, lalu peringkat disusun dari severity tertinggi, tekanan waktu, dan jumlah temuan.

Perhatian dan tindak lanjut. Temuan menjadi isu yang punya pemilik. Isu punya siklus sendiri: terbuka, menunggu bukti, ditutup dengan bukti, atau tidak lagi terdeteksi.

## Aturan yang dipegang kode

Selesai bukan berarti beres. Follow-up yang ditandai `DONE` tidak mengubah status isu. Isu hanya tertutup oleh `VERIFIED_RESOLVED` dengan record yang dimiliki proyek yang sama dan masuk setelah isu dibuka. Sudah selesai, buktinya datang belakangan, dan buktinya milik proyek lain ditolak dengan kode yang berbeda.

Status dari PIC tidak dipakai sebagai kesimpulan. Kolom status di master hanya dibaca sebagai laporan. Yang menentukan peringkat adalah aritmetika antara laporan, bukti, dan waktu.

Tidak ada angka tanpa asal. Setiap temuan membawa daftar record yang menjadi dasarnya, dan setiap record bisa dibuka dari layar.

Tidak ada aturan per proyek. Tidak ada `if project_id === 'PRJ-002'` di mana pun. Kalau sebuah proyek perlu perlakuan khusus, itu masuk ke data tipe proyek, bukan ke kode.

Temuan informasi tidak membuka isu. Lima belas temuan menjadi empat belas isu, karena satu temuan hanya memberi tahu bahwa penutupan sebuah proyek benar-benar terbukti.

## Struktur

```
backend/src/ingest      baca CSV dan JSON, normalisasi, kebijakan duplikat dan data terlambat
backend/src/interpret   konteks, detektor, severity, pengelompokan, peringkat
backend/src/store       isu, follow-up, tanggapan, riwayat versi record
backend/src/api         empat belas rute HTTP
backend/src/cli         impor, evaluasi, dump, verifikasi, probe versi
frontend/src/views      portofolio, detail proyek, sumber data
docs                    keputusan, catatan bug, proof pack, presentasi
proof                   keluaran mesin yang bisa dibangun ulang
```

## Perintah

| Perintah | Gunanya |
|---|---|
| `npm test` | 124 test di 8 berkas |
| `npm run verify -w backend` | 58 pemeriksaan rute dan integritas data pada basis data sementara |
| `npm run evaluate -w backend` | keluaran mesin dalam bentuk teks |
| `npm run probe:versions` | membuktikan riwayat versi record bekerja |
| `bash scripts/proof.sh` | membangun ulang seluruh proof pack dari nol |

## Batas

Data yang dipakai adalah data contoh dari brief. Alat ini tidak mengambil data dari sistem sungguhan, tidak mengirim pemberitahuan, dan tidak punya autentikasi maupun peran pengguna.

Ambang severity adalah keputusan rancangan, bukan hasil pengukuran. Rasio pace 1,05 dan 1,25, selisih 1 dan 5 poin persentase, serta batas data basi 2 kali cadence tidak punya dasar statistik. Semuanya bisa diubah, dan alasannya ada di `docs/DECISION_LOG.md`.

Mesin tidak meramalkan. Tidak ada model bahasa, tidak ada proyeksi. Semua angka berasal dari baris yang ada di basis data, dan semua kalimat berasal dari templat yang menerima angka itu.

## API

Enam belas rute, semuanya tanpa autentikasi karena brief melarangnya.

| Metode | Rute | Gunanya |
|---|---|---|
| GET | `/healthz` | status proses dan waktu acuan |
| GET | `/api/portfolio` | seluruh proyek berperingkat, temuan, dan hitungan isu |
| GET | `/api/projects/:id` | satu proyek: rantai sumber, dua persentase, temuan, isu |
| GET | `/api/issues` | daftar isu, bisa disaring `project_id` dan `status` |
| POST | `/api/issues/:id/status` | ubah status isu, dengan gerbang bukti |
| GET | `/api/projects/:id/followups` | daftar follow-up proyek |
| POST | `/api/projects/:id/followups` | buat follow-up |
| GET | `/api/followups/:id` | satu follow-up beserta kejadiannya |
| PATCH | `/api/followups/:id` | ubah status, pemilik, atau tanggal |
| GET | `/api/projects/:id/findings/:fingerprint/responses` | tanggapan atas satu temuan |
| POST | `/api/projects/:id/findings/:fingerprint/responses` | akui, bantah, atau jelaskan |
| GET | `/api/review` | antrean tanggapan yang menunggu keputusan manusia |
| POST | `/api/responses/:id/review` | terima atau tolak bantahan, dengan alasan |
| GET | `/api/source-inventory` | sebaran baris sumber dan impor terakhir |
| GET | `/api/import-runs/latest` | hasil impor terakhir |
| POST | `/api/import` | baca ulang berkas sumber dan selaraskan isu |

Kode galat sengaja dibedakan, bukan satu kode untuk semua penolakan: `EVIDENCE_REQUIRED` 422, `EVIDENCE_STALE` 409, `EVIDENCE_OTHER_PROJECT` 409, `PROJECT_NOT_FOUND` 404, `BAD_STATUS` 400.

## Model data

Tiga belas tabel. Yang penting untuk membaca perilakunya:

| Tabel | Isinya |
|---|---|
| `source_records` | satu baris per record sumber, dengan `source_kind` dan `provenance` |
| `observation_values` | nilai yang diekstrak dari record, satu baris per metrik |
| `record_versions` | versi lama record dengan alasan `SUPERSEDED` atau `LATE_ARRIVAL` |
| `projects`, `project_types` | master proyek dan aturan basis progress per tipe |
| `issues` | daftar kerja: OPEN, AWAITING_EVIDENCE, VERIFIED_RESOLVED, NOT_DETECTED |
| `followups`, `followup_events` | tindakan manusia dan riwayat perubahannya |
| `finding_responses` | tanggapan manusia atas temuan, beserta keputusan tinjauannya (`review_decision`, `reviewed_by`, `review_note`) |
| `import_runs`, `ingest_issues` | catatan impor dan peringatan normalisasi |
| `deadline_history`, `meta` | perubahan deadline dan waktu acuan `as_of` |

## Asumsi

Berkas CSV dan JSON adalah sumber otoritatif. Excel hanya pembanding, sesuai aturan brief.

`generated_at` pada berkas produksi dipakai sebagai waktu acuan, bukan jam dinding, supaya hasilnya bisa diulang.

Deadline dibaca sampai akhir hari. Konvensi ini yang menempatkan PRJ-001 di garis antara patuh dan terlambat.

Kolom status dan catatan progres di update mingguan adalah klaim, sekalipun ditulis PIC.

Nilai operasional dianggap bukti hanya kalau berasal dari sistem, bukan dari manusia.

## Alokasi waktu

Jejak komit menjadi dasar angka ini, bukan perkiraan setelah kejadian.

| Rentang | Yang dikerjakan |
|---|---|
| 22:30 - 23:40 | kerangka, skema, importer, dan mesin detektor |
| jeda malam | tidak ada pekerjaan tercatat |
| 06:36 - 07:02 | test, tiga bug, dan API isu serta follow-up |
| 08:26 - 08:51 | UI, slide dua bahasa, dan verifikasi menyeluruh |
| 09:15 | proof pack dan dry run |

Rentang kerja yang tercatat 3 jam 49 menit. Sisanya membaca brief, memeriksa hasil, dan menulis teks yang tidak selalu berujung komit. Saya tidak bisa membuktikan angka enam jam dan tidak mengklaimnya. Rinciannya ada di `AI_USAGE.md`.

## Berkas pendukung

- `AI_USAGE.md` apa yang dikerjakan model, dan apa yang diperiksa manusia
- `docs/DECISION_LOG.md` keputusan rancangan, alternatif yang ditolak, dan biaya membaliknya
- `docs/BUG_LOG.md` tiga belas bug beserta gejala, penyebab, dan test penjaganya
- `docs/PROOF_PACK.md` peta klaim ke berkas bukti
- `docs/REFLECTION.md` lima pertanyaan refleksi dari panduan pengiriman
- `docs/PRESENTATION.pdf` sepuluh slide bahasa Inggris, `docs/PRESENTATION-ID.pdf` versi Indonesia
- `docs/presentation.html` sumber kedua versi itu, dengan tombol `ID / EN`
