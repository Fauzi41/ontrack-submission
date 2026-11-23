# Proof pack

Direktori `proof/` berisi keluaran yang dihasilkan mesin, bukan salinan tangan. Semuanya dibangun dari satu perintah:

```bash
bash scripts/proof.sh
```

Perintah itu memakai basis data baru di `proof/ontrack.db`, jadi data kerja di `backend/data/ontrack.db` tidak tersentuh dan angkanya bisa diulang kapan saja. Waktu pembuatan dan komit yang dipakai tercatat di `proof/00-lingkungan.txt`.

## Isi direktori

| Berkas | Dibuat oleh | Isinya |
|---|---|---|
| `00-lingkungan.txt` | `date`, `git rev-parse`, `node -v` | waktu, komit, versi runtime |
| `01-impor.txt` | `npm run import -w backend` | laporan impor: baris diterima, ditolak, peringatan normalisasi, tabel progress |
| `02-evaluasi.txt` | `npm run evaluate -w backend` | keluaran mesin: peringkat, temuan, bukti per temuan |
| `json/portfolio.json` | `npm run dump -w backend` | jawaban `GET /api/portfolio` apa adanya |
| `json/issues.json` | sama | jawaban `GET /api/issues` |
| `json/source-inventory.json` | sama | jawaban `GET /api/source-inventory` |
| `04-test.txt` | `npm test` | 123 test, 8 berkas |
| `05-verifikasi.txt` | `npm run verify -w backend` | 58 pemeriksaan rute dan integritas data |
| `06-cakupan.txt` | `vitest --coverage` | cakupan per modul |
| `07-build.txt` | `npm run build -w frontend` | ukuran bundel |
| `08-versi.txt` | `npm run probe:versions` | bukti `record_versions` bekerja |
| `SUMMARY.md` | `scripts/proof-summary.mjs` | ringkasan yang dibaca dari berkas di atas |

`json/*.json` diambil dengan memanggil rute HTTP yang sama dengan yang dipakai antarmuka, bukan dihitung ulang oleh skrip terpisah. Karena itu angka di berkas bukti tidak mungkin berbeda dari angka di layar.

## Klaim dan tempat memeriksanya

Setiap kalimat di deck dan README bisa ditelusuri ke salah satu baris di bawah.

| Klaim | Angka | Periksa di |
|---|---|---|
| Enam proyek masuk, 41 baris sumber | 6 proyek, 41 baris (master 6, produksi 12, update 23) | `json/source-inventory.json`, `SUMMARY.md` |
| Peringkat ditentukan mesin, bukan urutan berkas | PRJ-002, PRJ-005, PRJ-004, PRJ-001, PRJ-003, PRJ-006 | `json/portfolio.json` bagian `rank` |
| PRJ-002 punya dua angka yang bertentangan | 76,25% laporan lawan 72,7% bukti, selisih 4.260 halaman | `json/portfolio.json`, temuan `progress_gap` dan `source_conflict` |
| PRJ-002 butuh laju yang tidak mungkin | 7.633 halaman/hari dibutuhkan, 3.266 halaman/hari tercapai | temuan `schedule_risk` pada proyek yang sama |
| PRJ-005 belum punya bukti sama sekali | 9 endpoint, 0 diuji, `last_successful_connection` tercatat absen | temuan `PRJ-005`, `02-evaluasi.txt` |
| Temuan informasi tidak membuka isu | 15 temuan menjadi 14 isu | `json/issues.json` lawan `json/portfolio.json` |
| Impor kedua tidak menggandakan data | 41 duplikat, 0 baris baru, portofolio identik | `05-verifikasi.txt` |
| Isu hanya tertutup dengan bukti baru | tanpa bukti 422, record lama 409, record proyek lain 409, record baru 200 | `05-verifikasi.txt` |
| Follow-up selesai tidak menutup isu | status follow-up `DONE`, hitungan isu tidak bergerak | `05-verifikasi.txt` |
| Bantahan menunggu keputusan manusia | antrean berisi 1, keputusan tercatat, antrean kembali 0, severity tetap `critical` | `05-verifikasi.txt` |
| Riwayat versi record benar-benar tersimpan | 2 versi: satu `SUPERSEDED`, satu `LATE_ARRIVAL` ditolak | `08-versi.txt` |
| Kode diuji, bukan hanya dijalankan sekali | 123 test, 58 pemeriksaan rute, cakupan 96,45% | `04-test.txt`, `05-verifikasi.txt`, `06-cakupan.txt` |

## Uji dari salinan bersih

Rantai yang sama dijalankan ulang pada klon baru di direktori sementara, dengan `node_modules` kosong:

```
git clone <repo> ontrack-dryrun
npm install                        283 paket, tanpa langkah tambahan
npm test                           123 test lulus
npm run verify -w backend          58/58 pemeriksaan lulus
npm run import -w backend          41 baris masuk, 6 proyek terbaca
npm run build -w frontend          165,69 kB
npm start -w backend               API dan antarmuka dari satu port
```

Antarmuka pada salinan itu dibuka di peramban pada port 3011 dan menampilkan enam proyek, empat kartu ringkasan (3 kritis, 1 perhatian, 1 pantau, 14 isu terbuka), dan waktu acuan `2026-10-06T17:00:00`. Tidak ada berkas di luar repositori yang dibutuhkan.

## Yang tidak dibuktikan di sini

Ambang severity adalah keputusan rancangan, bukan hasil pengukuran. Rasio pace 1,05 dan 1,25, selisih 1 dan 5 poin persentase, dan batas data basi 2 kali cadence tidak punya pembenaran statistik di baliknya. Semuanya terbuka untuk diubah, dan alasannya ditulis di `DECISION_LOG.md`.

Cakupan mengukur baris yang dijalankan, bukan benar atau salahnya ambang. Skrip CLI dikecualikan dari hitungan cakupan karena dijalankan utuh oleh `npm run verify` dan `npm run probe:versions`, dan pengecualian itu tertulis di `backend/vitest.config.ts`, bukan disembunyikan.

PDF presentasi dibangun manual lewat `Page.printToPDF` dari `docs/presentation.html`, bukan oleh `scripts/proof.sh`. Angka di dalamnya berasal dari berkas yang sama, tetapi pembaruannya tidak otomatis.
