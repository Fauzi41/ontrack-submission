# Decision log

Setiap keputusan di bawah punya alternatif yang sengaja tidak dipilih. Yang saya minta dari pembaca adalah menyerang alasannya, bukan hasilnya.

## D-001 SQLite langsung, bukan server basis data

Brief melarang cloud. Saya memakai `better-sqlite3` dengan API sinkron: satu berkas, nol proses tambahan, dan seluruh impor bisa dibungkus satu transaksi.

Alternatif yang ditolak: Postgres lewat Docker. Alasannya lebih besar dari manfaatnya untuk prototipe yang dinilai dalam hitungan jam dan harus bisa dijalankan penguji dengan `npm install` saja.

Biaya membalik: sedang. Skema memakai tipe yang portabel, tetapi kode store memanggil `prepare().run()` secara sinkron di banyak tempat. Pindah ke driver asinkron menyentuh hampir semua modul store.

## D-002 Update dari manusia dicatat sebagai REPORTED, bukan bukti

Kolom status dan catatan progres di berkas update adalah klaim, bukan pengamatan. Saya menandainya `provenance = REPORTED` di tabel sumber.

Alternatif yang ditolak: memperlakukan update mingguan sebagai bukti tervalidasi karena ditulis oleh PIC. Itu justru kesalahan yang ingin ditunjukkan alat ini.

Biaya membalik: rendah. Nilainya satu kolom, tetapi membalik artinya mengubah kesimpulan hampir semua proyek.

## D-003 Waktu acuan diambil dari `generated_at`, bukan jam dinding

Seluruh peringkat dihitung pada `as_of = 2026-10-06T17:00:00`, waktu berkas produksi dibuat.

Alternatif yang ditolak: memakai `now()` saat impor. Dengan itu, proyek yang deadlinya 10 Oktober akan terbaca berbeda tergantung kapan penguji menjalankan perintah, dan hasilnya tidak bisa diulang.

Biaya membalik: rendah, satu baris di importer. Tetapi semua angka di dokumen harus ditulis ulang.

## D-004 Deadline dibaca sebagai akhir hari

Deadline `2026-10-10` dihitung sampai `23:59:59` pada tanggal itu.

Alternatif yang ditolak: tengah malam di awal hari, yang membuat proyek kehilangan satu hari penuh.

Konsekuensi yang harus diketahui: PRJ-001 berdiri tepat di garis. Dengan konvensi ini rasionya 0,991 kali laju yang dibutuhkan menurut laporan, dan 1,26 kali menurut bukti tervalidasi. Selisih sekecil itu lahir dari konvensi jam, bukan dari data. Karena itu PRJ-001 diberi tanda `borderline` dan tidak dinaikkan ke kritis.

Biaya membalik: rendah di kode, tinggi di kesimpulan. Satu proyek berpindah peringkat.

## D-005 Basis progress adalah data per tipe proyek

Tabel `project_types` menyimpan `progress_basis` dan `rate_model`. Proyek digitalisasi memakai kuantitas tervalidasi dengan model aliran. Proyek integrasi memakai endpoint yang diterima di production dengan model diskret.

Alternatif yang ditolak: satu rumus persentase untuk semua proyek. Untuk PRJ-005, rumus itu akan melaporkan 90% karena sembilan dari sepuluh endpoint sudah ditulis, padahal nol endpoint pernah diuji di production dan `last_successful_connection` tercatat absen. Angka 90% itu benar secara aritmetika dan salah secara makna.

Biaya membalik: rendah. Menambah tipe proyek cukup menambah baris, tanpa menyentuh detektor.

## D-006 Dua basis sah yang berselisih tidak boleh menjadi kritis

Kalau laporan dan bukti memberi kesimpulan berbeda tentang pace, severity diturunkan ke `borderline`, dan itu terlihat di layar.

Alternatif yang ditolak: memilih basis yang paling pesimis. Cara itu membuat alat selalu bisa dibenarkan, dan justru menghilangkan informasi bahwa ada dua jawaban.

Biaya membalik: rendah. Satu aturan di engine, satu test.

## D-007 Deadline lewat dipisah dari risiko jadwal

`schedule_risk` mengukur laju terhadap sisa waktu. `deadline_passed` menandai proyek yang deadlinya sudah lewat dan belum selesai. Keduanya tidak bisa hidup di satu detektor, karena proyek yang sudah telat tidak punya sisa waktu untuk dibagi.

Alternatif yang ditolak: memaksa semuanya ke `schedule_risk` dengan pembagi nol yang dijaga. Hasilnya proyek telat akan muncul sebagai "laju tidak cukup" tanpa menyebut hal yang sebenarnya.

Biaya membalik: rendah, tetapi judul kelompok temuan harus ikut disesuaikan.

## D-008 Persentase yang dihitung hanya dari bukti tervalidasi

`pct_calculated` diisi dari kuantitas tervalidasi, dan kosong kalau tidak ada bukti sama sekali. Untuk PRJ-002 nilainya 72,7%, sementara laporan mengatakan 76,25%.

Alternatif yang ditolak: mengisi kolom itu dari angka laporan. Ini kesalahan yang sempat terjadi di kode dan tertangkap saat memeriksa layar: dua kolom yang seharusnya berbeda menampilkan angka identik. Tercatat sebagai B-010.

Biaya membalik: rendah di kode. Tetapi membalik artinya menghapus satu-satunya tempat selisih laporan dan bukti bisa terlihat berdampingan.

## D-009 Temuan informasi tidak membuka isu

Lima belas temuan menghasilkan empat belas isu. Temuan `verified_closure` pada PRJ-006 tidak membuka isu karena isinya justru kabar baik yang sudah terbukti.

Alternatif yang ditolak: setiap temuan menjadi isu. Cara itu membuat daftar kerja berisi hal yang tidak perlu dikerjakan, dan itu melemahkan arti daftar itu sendiri.

Biaya membalik: rendah. Satu filter di `syncIssues`.

## D-010 Riwayat versi record disimpan di tabel terpisah

Permintaan brief adalah versi record wajib disimpan. Saya membuat tabel `record_versions` yang menampung versi lama dengan alasan `SUPERSEDED` atau `LATE_ARRIVAL`, dan menunjuk record yang berlaku sekarang.

Alternatif yang ditolak: menyimpan versi sebagai kolom tambahan di `source_records`. Cara itu hanya menyimpan satu versi sebelumnya, dan tidak bisa menjawab pertanyaan "berapa kali angka ini berubah".

Biaya membalik: sedang. Tabel ini tidak dibaca layar, hanya oleh `npm run probe:versions` dan pemeriksaan manual.

## D-011 Server menyelaraskan isu saat hidup, bukan hanya saat impor lewat API

Basis data yang diisi lewat CLI tidak pernah melewati rute impor, sehingga isu tidak terbentuk dan layar menampilkan temuan tanpa daftar kerja. Server sekarang menyelaraskan sekali saat boot, dan idempoten.

Alternatif yang ditolak: mewajibkan impor selalu lewat HTTP. Itu memindahkan masalah ke penguji yang menjalankan `npm run import`.

Biaya membalik: rendah, tetapi menghapusnya akan menghidupkan kembali celah yang sudah tercatat.

## D-012 Ambang severity adalah keputusan, bukan temuan

Rasio pace di atas 1,05 menjadi `attention`, di atas 1,25 menjadi `critical`. Selisih aritmetika di atas 1 poin persentase menjadi `watch`, di atas 5 menjadi `attention`. Data basi di atas 2 kali `expected_cadence_hours` dianggap berhenti.

Alternatif yang ditolak: memilih ambang dari literatur manajemen proyek. Tidak ada angka yang bisa dipertanggungjawabkan untuk konteks ini, dan meminjamnya akan memberi kesan presisi yang tidak ada.

Yang bisa diserang: 1,25 kali laju masih bisa dicapai dengan menambah satu shift, jadi mungkin terlalu dini menyebutnya kritis. Batas 2 kali cadence untuk PRJ-003 tepat 144 jam, dan berubahnya satu jam akan mengubah temuannya.

Biaya membalik: sangat rendah, tiga angka di satu berkas. Justru itu alasannya ditulis di sini.

## D-013 Penutupan isu butuh bukti yang lebih baru dari isu itu sendiri

`VERIFIED_RESOLVED` hanya diterima kalau `evidence_ref` menunjuk record milik proyek yang sama, record itu masuk setelah isu dibuka, dan nilainya benar-benar ada. Tanpa bukti dijawab 422, record lama 409 `EVIDENCE_STALE`, record proyek lain 409 `EVIDENCE_OTHER_PROJECT`.

Alternatif yang ditolak: mengizinkan penutupan dengan catatan bebas. Itu membuat kata "selesai" kembali tidak bisa dipercaya, padahal seluruh alat ini dibangun untuk memisahkan klaim dari bukti.

Biaya membalik: rendah di kode, tinggi di makna. Tanpa aturan ini alatnya berubah menjadi dashboard status biasa.

## D-014 Urutan pengerjaan deck sebelum proof pack

Slide presentasi dikerjakan lebih dulu daripada proof pack dan dokumen, karena itu bagian dengan risiko waktu tertinggi dan hasilnya memaksa angka terakhir dibekukan lebih awal.

Alternatif yang ditolak: mengikuti urutan alami brief. Saya sudah melihat bahwa dokumen selalu jadi bagian yang dikorbankan saat waktu habis, jadi bagian yang paling mahal dikerjakan saat masih ada waktu.

Biaya membalik: tidak ada. Ini urutan kerja, bukan keputusan teknis.

## D-015 Keputusan tinjauan dicatat, severity mesin tidak diubah

Bantahan dan penjelasan dari PIC masuk ke antrean `GET /api/review`. Manusia memutuskan `UPHELD` atau `DENIED` lewat `POST /api/responses/:id/review`, dengan alasan wajib dan nama peninjau. Keputusan itu tersimpan di baris tanggapan, bukan menimpa hasil hitung mesin.

Alternatif yang ditolak: keputusan `UPHELD` langsung menurunkan severity temuan. Cara itu membuat satu klik manusia bisa menghapus temuan yang belum tentu salah, dan menghilangkan jejak bahwa mesin pernah menyimpulkan lain.

Biaya membalik: rendah di kode, tinggi di keterlacakan. Kalau severity ikut berubah, riwayat "apa yang mesin katakan" hilang.

## D-016 Tabel `findings` dibuang, temuan tetap dihitung saat permintaan

Skema awal menyiapkan tabel `findings`, tetapi tidak ada kode yang menulisinya. Temuan dihitung dari konteks dan bukti setiap kali dibutuhkan, karena hasilnya bergantung pada `as_of` dan pada status isu. Tabel itu dihapus supaya tidak ada yang mengira ada simpanan temuan.

Alternatif yang ditolak: menyimpan temuan setiap impor. Itu menambah satu sumber kebenaran kedua yang bisa berselisih dengan hasil hitung, persis masalah yang alat ini coba hindari.

Biaya membalik: sedang. Kalau suatu hari temuan perlu riwayat, tabel itu harus dibuat lagi dengan kunci `(project_id, fingerprint, as_of)` dan ditulis oleh satu jalur saja.

## D-017 Presentasi satu bahasa, Inggris

Deck awalnya dibuat dua bahasa dengan tombol `ID / EN`. Versi Indonesia dikerjakan cepat dan hasilnya berantakan: kalimat terlalu panjang untuk kotak slide, istilah campur, dan beberapa baris terasa diterjemahkan alih-alih ditulis. Versi Indonesia dibuang, tombol bahasa dihapus, dan `docs/PRESENTATION.pdf` sekarang satu bahasa.

Alternatif yang ditolak: memperbaiki versi Indonesia. Itu pekerjaan menulis ulang sepuluh slide, bukan menerjemahkan, dan tidak menambah apa pun yang dinilai. Bahasa pengantar presentasi tetap bisa Indonesia secara lisan.

Biaya membalik: rendah. Sumbernya satu berkas HTML dengan satu larik slide, jadi menambah bahasa lain berarti menambah larik, bukan membongkar tampilan.

