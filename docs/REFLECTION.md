# Lima pertanyaan refleksi

Jawaban di bawah mengacu pada berkas di repositori ini, bukan pada niat.

## 1. Mana bagian data yang laporan, mana yang bukti operasional, dan bagaimana membedakannya

Setiap baris sumber dicatat dengan dua kolom yang tidak pernah diisi dari tebakan: `source_kind` (MASTER, UPDATE, PRODUCTION) dan `provenance` (REPORTED atau OPERATIONAL). Dari 41 baris yang masuk, 29 adalah REPORTED (6 baris master dan 23 update mingguan) dan 12 adalah OPERATIONAL dari sistem scanner, gudang, API, dan DMS.

Pembedaan itu bukan label di laporan, tetapi aturan yang dipakai mesin. Detektor hanya memperlakukan nilai OPERATIONAL sebagai bukti tervalidasi. `pct_calculated` dihitung dari nilai tervalidasi saja, sehingga untuk PRJ-002 angkanya 72,7% sementara master mengatakan 76,25%. Kalau tidak ada bukti operasional sama sekali, kolom itu kosong, bukan diisi angka laporan. Itu yang terjadi pada PRJ-005: sembilan endpoint tercatat di laporan, nol endpoint pernah diuji di production, dan `last_successful_connection` tercatat `KNOWN_ABSENT`.

Ada satu lapisan tambahan yang mudah terlewat. Update mingguan ditulis manusia, jadi isinya klaim walaupun bentuknya rapi dan bertanggal. Kolom `provenance` menyimpan fakta itu, dan tidak ada tempat di kode yang memperlakukannya sebagai pengamatan.

## 2. Ketika dua sumber berbeda, bagaimana sistem menahan diri dari klaim yang tidak berdasar

Tiga lapis.

Pertama, angka tidak pernah digabung. Nilai laporan dan nilai operasional hidup di baris terpisah. Tidak ada rata-rata, tidak ada pemilihan otomatis. Layar menampilkan keduanya berdampingan justru supaya selisihnya terlihat: 91.500 halaman menurut master, 87.240 menurut scanner, selisih 4.260 halaman tanpa penjelasan dari sumber mana pun.

Kedua, selisih itu sendiri menjadi temuan, bukan diselesaikan diam-diam. Detektor `source_conflict` dan `progress_gap` menerbitkan temuan dengan daftar bukti dan daftar hal yang belum diketahui. Kalimatnya menyebut batasnya sendiri: "Keduanya tidak bisa benar sekaligus", bukan "angka master salah".

Ketiga, kalau dua basis yang sama-sama sah memberi kesimpulan berbeda tentang laju, severity diturunkan ke `borderline` dan tidak boleh menjadi kritis. PRJ-001 adalah contohnya: laporannya 0,991 kali laju yang dibutuhkan, bukti tervalidasinya 1,26 kali. Memilih yang paling pesimis akan selalu bisa dibenarkan, dan justru menghapus informasi bahwa ada dua jawaban.

Keputusan akhir tetap milik manusia. Alat ini hanya memastikan keputusan itu diambil dengan melihat kedua angka.

## 3. Apa yang pecah lebih dulu pada 500 proyek dengan pembaruan harian

Yang pecah pertama bukan penyimpanan, melainkan `GET /api/portfolio`. Rute itu menghitung ulang seluruh portofolio pada setiap permintaan, dan `loadFacts` menjalankan satu kueri per proyek. Pada 6 proyek itu 7 kueri. Pada 500 proyek menjadi 501 kueri untuk satu permintaan layar, dan setiap proyek masih memetakan nilai observasinya dengan pencarian linear per baris, yang membuat biayanya tumbuh kuadratik di dalam proyek.

Kedua, tidak ada paginasi. Seluruh portofolio dan seluruh isu dikirim dalam satu jawaban. Pada 500 proyek, jawaban itu membawa ratusan temuan beserta daftar buktinya, dan itu dikirim ulang setiap kali layar dibuka.

Ketiga, impor. Setiap kali berjalan, impor membaca seluruh berkas, memeriksa satu per satu terhadap record yang sudah ada, dan melakukannya dalam satu transaksi. Dengan pembaruan harian, berkas tumbuh terus, sehingga pekerjaan per impor naik sejalan dengan seluruh riwayat, bukan dengan jumlah baris baru. SQLite hanya mengizinkan satu penulis pada satu waktu, jadi transaksi panjang itu juga menahan penulisan lain, termasuk follow-up dan perubahan status isu yang dilakukan manajer saat impor berjalan.

Urutan perbaikan yang saya pilih kalau harus: satukan pembacaan menjadi satu kueri agregat, tambahkan paginasi dan endpoint ringkasan, ubah impor menjadi tambahan bertahap yang berkunci pada identitas record, baru setelah itu mempertimbangkan basis data dengan penulis banyak.

## 4. Bagaimana manajer tahu siapa pemilik tindak lanjut, apakah tindakannya selesai, dan apakah isunya benar-benar beres

Tiga pertanyaan itu dijawab oleh tiga hal berbeda, dan pemisahannya disengaja.

Pemilik ada di dua tempat. Temuan membawa `owner` beserta `owner_reason` yang menjelaskan mengapa pekerjaan itu milik peran tersebut, misalnya PROJECT_MANAGER karena perbaikan ada di dalam kendali PM. Follow-up membawa `owner` berupa nama orang.

Status tindakan ada di follow-up: OPEN, IN_PROGRESS, DONE, CANCELLED. Setiap perubahan dicatat sebagai kejadian di `followup_events`, lengkap dengan waktu dan pelakunya.

Status isu ada di tabel `issues` dan tidak pernah disimpulkan dari status follow-up. Menandai follow-up `DONE` hanya mencatat bahwa pekerjaannya selesai, dan jawaban API menyebutnya apa adanya: "Status DONE dicatat. Isu tidak berubah." Layar dan skrip verifikasi memeriksa bahwa hitungan isu terbuka tidak bergerak setelah itu.

Isu hanya berpindah ke `VERIFIED_RESOLVED` kalau ada record bukti yang dimiliki proyek yang sama, masuk setelah isu dibuka, dan benar-benar ada di basis data. Tanpa bukti dijawab 422, record lama 409 `EVIDENCE_STALE`, record proyek lain 409 `EVIDENCE_OTHER_PROJECT`. Record penutupnya disimpan di kolom `resolved_by_record`, jadi klaim "sudah beres" selalu menunjuk satu baris yang bisa dibuka.

## 5. Dengan dua hari tambahan, apa yang saya perbaiki lebih dulu dan mengapa

Hari pertama untuk jalur data pada skala, karena itu satu-satunya bagian yang sudah saya ketahui akan gagal dan belum saya buktikan dengan beban nyata. Sasaran konkretnya: kueri agregat untuk portofolio, paginasi, dan impor bertahap. Saya ingin menutupnya dengan uji beban buatan 500 proyek supaya klaim di pertanyaan nomor 3 berubah dari dugaan menjadi angka.

Hari kedua untuk membuat antrean tinjauan itu berguna pada skala. Antrean sudah ada: tab Tinjauan menampilkan setiap bantahan dan penjelasan yang belum diputuskan, dan keputusan manusia tercatat bersama alasannya tanpa mengubah severity mesin. Yang belum ada adalah tenggat, eskalasi, dan penyaringan per pemilik, sehingga pada 500 proyek antrean itu akan menjadi daftar panjang tanpa urutan Prioritas. Saya akan menambahkan batas waktu tanggapan, penanda lewat tenggat, dan penyaring per pengelola, lalu mengukurnya dengan uji beban yang sama seperti hari pertama.

Catatan jujur: antrean ini baru dibangun setelah dokumen ini pertama kali ditulis. Sebelumnya bantahan hanya tersimpan dan tidak pernah terbaca, dan itu saya sebut sebagai celah paling merusak di penilaian awal.

Yang sengaja tidak saya dahulukan: notifikasi keluar, autentikasi, dan penyuntingan temuan oleh manusia. Ketiganya menambah permukaan tanpa mengubah kebenaran angka, dan kebenaran angka adalah satu-satunya alasan alat ini ada.
