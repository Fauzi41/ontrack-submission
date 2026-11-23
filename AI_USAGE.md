# AI usage

Bagian ini menjelaskan apa yang dikerjakan model, apa yang diperiksa manusia, dan di mana model salah. Tujuannya supaya penilai bisa menimbang hasil ini tanpa menebak.

## Pembagian kerja

Saya memakai agen pengkode (Hermes, model deepseek-v4.1-flash) yang bisa menjalankan terminal, membuka browser, dan menulis berkas. Hampir semua kode dan teks dihasilkan oleh model. Manusia menetapkan batas, memilih di antara alternatif, dan memutuskan kapan sesuatu dianggap selesai.

Keputusan yang datang dari manusia, bukan dari model:

- tabel `record_versions` harus berdiri sendiri sebagai riwayat versi
- presentasi harus dua bahasa, Indonesia dan Inggris
- semua teks ditulis dengan aturan tertentu: tanpa em dash, tanpa emoji hiasan, tanpa daftar berjudul tebal, tanpa kalimat pemanasan
- setiap fase harus diuji sebelum lanjut, dan setiap bug harus dicatat, bukan hanya diperbaiki
- slide dikerjakan sebelum proof pack dan dokumen, karena itu bagian paling berisiko waktu

Keputusan yang diambil model lalu disetujui manusia: pemakaian SQLite, aturan penutupan isu, ambang severity, dan urutan detektor.

## Yang diperiksa perintah, bukan diterima karena model mengatakannya

Klaim tanpa keluaran perintah tidak saya anggap selesai. Pemeriksaan yang benar-benar dijalankan:

- `npm test` melaporkan 115 test di 8 berkas
- `npm run verify -w backend` melaporkan 50 dari 50 pemeriksaan lulus, termasuk gerbang bukti dan empat pemeriksaan integritas SQL
- `npm run probe:versions` melaporkan 6 dari 6 pemeriksaan lulus, termasuk penolakan record yang lebih tua
- cakupan diukur dengan `vitest --coverage`, bukan diperkirakan
- antarmuka diklik di browser sungguhan: menandai isu menunggu bukti, mencoba menutup dengan record lama, membuat follow-up, menandainya selesai, lalu memastikan hitungan isu tidak bergerak
- slide diperiksa dengan mengukur `scrollHeight - clientHeight` pada sepuluh slide di dua bahasa, lalu diperiksa lagi secara visual pada slide terpadat
- PDF dihitung halamannya dari struktur berkas, bukan dari asumsi

## Di mana model salah

Lima kesalahan berikut ditemukan setelah hasilnya diperiksa, dan semuanya sudah diperbaiki.

Persentase yang dihitung menyalin angka laporan. Layar menampilkan 76,25% dua kali, di kolom yang seharusnya berbeda. Ketahuan saat membandingkan dua kolom yang seharusnya tidak sama, dan menjadi B-010.

Slide menyebut PRJ-006 punya satu temuan yang menuntut tindakan, sementara layar menghitungnya nol karena temuan itu bersifat informasi. Angkanya berasal dari model yang membaca daftar temuan tanpa menerapkan aturan yang sama dengan kode. Ketahuan saat mencocokkan slide dengan jawaban API.

Skrip probe versi mengubah fixture sebelum impor pertama, sehingga "impor kedua" tidak melihat perubahan apa pun dan seluruh pemeriksaannya kosong. Ketahuan karena pemeriksaan itu gagal, bukan karena hasilnya mencurigakan.

Skrip verifikasi mengharapkan `200` pada rute yang menjawab `201`, lalu mengungkap ketidakcocokan yang sebenarnya: rute tanggapan menolak pemanggil tanpa nama pelaku, sementara rute follow-up memberinya nilai bawaan. Menjadi B-011.

Laporan sementara menyebut 108 test di 9 berkas. Jumlah berkasnya 8. Angka itu ikut masuk ke slide, dan harus diperbaiki di dua bahasa setelah pengukuran ulang.

## Soal waktu

Brief menyebut batas enam jam. Yang bisa diperiksa adalah jejak komit, dan jejaknya begini:

```
11-22 22:30  fase 1-2
11-22 22:36  humanize
11-22 23:40  fase 3
11-23 06:36  test 47
11-23 06:40  tiga bug
11-23 06:50  86 test
11-23 07:02  fase 4
11-23 08:26  selaraskan isu saat boot
11-23 08:34  fase 5
11-23 08:40  fase 9
11-23 08:51  verifikasi menyeluruh
11-23 09:15  proof pack
```

Jarak dari komit pertama ke terakhir sebelas jam, dengan jeda panjang antara 23:40 dan 06:36. Rentang kerja yang tercatat adalah 1 jam 10 menit sebelum jeda dan 2 jam 39 menit sesudahnya, jadi 3 jam 49 menit. Sisanya adalah membaca brief, memeriksa hasil, dan menulis teks yang tidak selalu menghasilkan komit.

Saya tidak bisa membuktikan angka enam jam, dan tidak akan mengklaimnya. Yang bisa saya tunjukkan adalah jejak di atas, dan bahwa setiap fase punya keluarannya sendiri.

## Yang tidak dikerjakan model

Model tidak punya akses ke data proyek sungguhan, jadi seluruh isi basis data berasal dari berkas contoh di brief.

Model juga tidak bisa memutuskan ambang mana yang benar. Rasio 1,25 dan batas 2 kali cadence adalah pilihan yang bisa diserang, dan sengaja ditulis terbuka di `DECISION_LOG.md`.

Terakhir, model cenderung menyatakan pekerjaan selesai lebih cepat daripada kenyataannya. Karena itu setiap klaim di dokumen ini diberi perintah yang bisa dijalankan untuk membuktikannya, dan seluruhnya bisa dibangun ulang dengan `bash scripts/proof.sh`.
