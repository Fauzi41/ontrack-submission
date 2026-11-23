# Bug Log

Catatan bug yang ditemukan selama pengerjaan, termasuk yang ditemukan oleh test
sendiri. Setiap baris punya tiga hal: gejalanya, penyebabnya, dan test yang
sekarang menjaganya agar tidak kembali.

Tidak ada bug yang saya hapus dari daftar ini karena sudah diperbaiki. Daftar
yang bersih biasanya berarti pencatatannya kurang teliti, bukan kodenya bersih.

## Ringkasan

| ID | Ditemukan oleh | Area | Dampak bila lolos |
|---|---|---|---|
| B-001 | test | detektor kapasitas | severity terlalu tinggi |
| B-002 | test | laporan impor | laporan berbohong soal baris yang dibuang |
| B-003 | penyisiran manual | teks temuan | angka palsu di dalam kalimat |
| B-004 | penyisiran manual | detektor jadwal | kasus paling gawat lolos tanpa suara |
| B-005 | penyisiran manual | penutupan proyek | klaim "tepat waktu" tanpa dasar |
| B-006 | penyisiran manual | pengelompokan | judul kelompok menyesatkan |
| B-007 | pengukuran cakupan | konteks waktu | proyek selesai terbaca terlambat |
| B-008 | pengukuran cakupan | importer | peringatan data hilang tanpa jejak |
| B-009 | test API | penutupan isu | semua penutupan gagal 500 |
| B-010 | pemeriksaan UI | persentase progress | dua angka berbeda tampil identik |
| B-011 | skrip verifikasi | tanggapan temuan | pemanggil API tanpa nama pelaku ditolak, follow-up tidak |

---

## B-001 Perbaikan unit tidak dikenali sebagai perbaikan

**Gejala.** Scanner yang berubah dari `OUT_OF_SERVICE` ke `LIMITED` tetap
menghasilkan severity perhatian, seolah tidak ada perubahan.

**Penyebab.** Detektor membandingkan jumlah unit yang terganggu, bukan tingkat
gangguannya. Satu unit rusak menjadi satu unit terbatas: jumlahnya tetap satu,
jadi dianggap tidak membaik.

**Perbaikan.** Keadaan unit diberi peringkat (RUNNING 0, LIMITED 1, mati 2), lalu
yang dibandingkan adalah peringkat terburuk sebelumnya dengan sekarang.

**Penjaga.** `tests/detectors.test.ts`, kasus "membedakan membaik dari tetap rusak".

---

## B-002 Laporan impor bilang nol ditolak padahal ada yang dibuang

**Gejala.** Impor dengan satu baris cacat melaporkan `rejected: 0`.

**Penyebab.** Penghitung `rejected` hanya dinaikkan saat validasi gagal. Baris
yang dibuang lebih awal oleh parser masuk ke daftar issue tapi tidak pernah
dihitung.

**Perbaikan.** Jumlah baris yang dibuang parser ikut masuk ke penghitung awal.

**Penjaga.** `tests/importer.test.ts`, kasus "menolak baris cacat".

---

## B-003 Jam di dalam teks temuan ditulis tangan

**Gejala.** Temuan kapasitas menyebut "sudah membaik dari 08:15" untuk proyek
mana pun, termasuk yang datanya tidak punya jam tersebut.

**Penyebab.** Kalimatnya disusun dengan jam yang saya tulis langsung di kode,
bukan dibaca dari snapshot pembandingnya.

**Perbaikan.** Jam dan status pembanding diambil dari record sebelumnya. Kalau
tidak ada record sebelumnya, kalimat itu tidak dipakai.

**Penjaga.** `tests/detectors.test.ts`, kasus "mengambil jam pembanding dari data".
Test memakai 09:05 dan menolak kemunculan 08:15.

---

## B-004 Proyek yang lewat deadline tidak menghasilkan temuan

**Gejala.** Proyek dengan deadline kemarin dan status masih berjalan tidak muncul
di daftar perhatian sama sekali.

**Penyebab.** Detektor jadwal keluar lebih awal ketika sisa hari kurang dari nol,
karena rumus laju tidak lagi bermakna. Akibatnya kasus paling gawat justru
dilewati.

**Perbaikan.** Ada cabang khusus sebelum perhitungan laju: deadline lewat dan
belum selesai menjadi temuan kritis tersendiri.

**Penjaga.** `tests/edge-cases.test.ts`, kasus "melaporkan deadline yang lewat".

---

## B-005 Klaim tepat waktu tanpa waktu selesai

**Gejala.** Proyek berstatus selesai tanpa record deployment tetap disebut
"selesai tepat waktu".

**Penyebab.** Perbandingan tanggal hanya dilakukan bila waktu selesai ada, tapi
kalimat untuk kasus "tidak ada waktu" memakai kalimat yang sama dengan kasus
"tepat waktu".

**Perbaikan.** Tiga kalimat terpisah: tepat waktu, terlambat, dan tidak bisa
dinilai karena waktunya tidak tercatat.

**Penjaga.** `tests/detectors.test.ts`, kasus "tidak mengarang ketepatan waktu".

---

## B-006 Judul kelompok hanya menyebut masalah terkuat

**Gejala.** Kelompok temuan PRJ-003 tampil sebagai "Laporan berhenti masuk"
padahal di dalamnya juga ada temuan angka 94% yang tidak cocok dengan 92%.

**Penyebab.** Judul diambil dari anggota dengan severity tertinggi. Saat beberapa
anggota seri, pemenangnya ditentukan urutan array, bukan kepentingan.

**Perbaikan.** Judul menyebut semua detektor di dalam kelompok, dipisah garis
miring.

**Penjaga.** `tests/portfolio.test.ts`, kasus "menyebut semua masalah di judul kelompok".

---

## B-007 Proyek selesai terbaca terlambat

**Gejala.** PRJ-006 yang selesai tepat waktu menyimpan `overdueDays` sebesar 5,7.

**Penyebab.** Selisih hari dihitung dari deadline tanpa melihat status. Untuk
proyek yang sudah ditutup, angka itu tidak punya arti.

**Perbaikan.** `overdueDays` hanya diisi bila proyek belum selesai.

**Penjaga.** `tests/edge-cases.test.ts`, kasus "tidak menyebut overdue untuk proyek
yang sudah selesai".

---

## B-008 Peringatan pada baris master tidak pernah dilaporkan

**Gejala.** Baris master dengan nilai `target` berupa teks tetap masuk, tapi tidak
ada satu pun peringatan di laporan impor.

**Penyebab.** Perulangan normalisasi hanya melaporkan issue untuk baris yang
ditolak. Baris yang diterima dengan peringatan (angka tak terbaca, format tanggal
salah) tidak pernah menyumbang issue.

**Perbaikan.** Semua issue dilaporkan; penghitung `rejected` tetap hanya naik
untuk baris yang benar-benar ditolak.

**Penjaga.** `tests/importer.test.ts`, kasus "mencatat angka tak terbaca".

---

## B-009 Kolom record bukti salah nama, semua penutupan isu gagal 500

**Gejala.** Setiap percobaan menutup isu dengan record bukti dijawab `500 SQLITE_ERROR: no such column: source_record_id`.

**Penyebab.** Tabel `source_records` menyimpan identitas baris di kolom `source_ref_id`, sedangkan kode pencarian bukti memakai `source_record_id`. Kesalahan ini tidak terlihat saat pengembangan karena jalur tersebut baru dipakai setelah endpoint penutupan isu ada.

**Perbaikan.** Kedua tempat pencarian bukti memakai `source_ref_id`.

**Penjaga.** `tests/api.test.ts`, kasus "menolak record yang sudah ada saat isu dibuka" dan "menolak record milik proyek lain".

---

## B-010 Persentase hitung hanya menyalin persentase laporan

**Gejala.** Di layar, "76,3% menurut laporan" dan "76,3% dihitung dari bukti" tampil sama untuk PRJ-002, padahal angka tervalidasinya 87.240 dari 120.000, yaitu 72,7%.

**Penyebab.** `pct_calculated` diisi dari angka laporan, bukan dari `validated`. Akibatnya dua angka yang seharusnya menunjukkan selisih selalu identik.

**Perbaikan.** `pct_calculated` diisi dari nilai tervalidasi; bila tidak ada bukti tervalidasi, nilainya kosong dan layar menulis "tidak ada".

**Penjaga.** `tests/portfolio.test.ts`, kasus "persentase hitung datang dari bukti".

---

## B-011 Dua rute yang sejenis memperlakukan pelaku berbeda

**Gejala.** `POST /api/projects/:id/findings/:fingerprint/responses` tanpa field `actor` dijawab `400 ACTOR_REQUIRED`, sementara `POST /api/projects/:id/followups` tanpa `actor` berjalan normal dengan nilai bawaan `api`.

**Penyebab.** Nilai bawaan dipasang di rute follow-up, tapi lupa dipasang di rute tanggapan. Aturan "pelaku wajib" jadi berlaku tidak merata.

**Perbaikan.** Rute tanggapan memakai nilai bawaan yang sama.

**Penjaga.** `npm run verify -w backend` memanggil rute itu tanpa `actor` dan mengharapkan `201`. Skrip itu yang menemukannya.

---

## Pembersihan yang bukan bug

- `worstSeverity` diekspor dari `types.ts` tapi tidak pernah dipanggil. Dihapus,
  bukan diuji, supaya tidak ada jalur mati yang terlihat seperti bagian sistem.
- Nomor baris pada pesan baris cacat sebelumnya dihitung dari posisi setelah baris
  lain dibuang, jadi bisa menunjuk baris yang salah. Sekarang nomor baris asli
  ikut dibawa dari parser.
