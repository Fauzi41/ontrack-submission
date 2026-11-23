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
| `npm test` | 115 test di 8 berkas |
| `npm run verify -w backend` | 50 pemeriksaan rute dan integritas data pada basis data sementara |
| `npm run evaluate -w backend` | keluaran mesin dalam bentuk teks |
| `npm run probe:versions` | membuktikan riwayat versi record bekerja |
| `bash scripts/proof.sh` | membangun ulang seluruh proof pack dari nol |

## Batas

Data yang dipakai adalah data contoh dari brief. Alat ini tidak mengambil data dari sistem sungguhan, tidak mengirim pemberitahuan, dan tidak punya autentikasi maupun peran pengguna.

Ambang severity adalah keputusan rancangan, bukan hasil pengukuran. Rasio pace 1,05 dan 1,25, selisih 1 dan 5 poin persentase, serta batas data basi 2 kali cadence tidak punya dasar statistik. Semuanya bisa diubah, dan alasannya ada di `docs/DECISION_LOG.md`.

Mesin tidak meramalkan. Tidak ada model bahasa, tidak ada proyeksi. Semua angka berasal dari baris yang ada di basis data, dan semua kalimat berasal dari templat yang menerima angka itu.

## Berkas pendukung

- `docs/DECISION_LOG.md` keputusan rancangan, alternatif yang ditolak, dan biaya membaliknya
- `docs/BUG_LOG.md` sebelas bug beserta gejala, penyebab, dan test penjaganya
- `docs/PROOF_PACK.md` peta klaim ke berkas bukti
- `docs/AI_USAGE.md` apa yang dikerjakan model, dan apa yang diperiksa manusia
- `docs/presentation.html` sepuluh slide dalam dua bahasa, dengan tombol `ID / EN`
