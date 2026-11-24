# Proof Pack (`PROOF_PACK.md`)

Dokumen ini merangkum bukti eksekusi nyata (*reproducible verification bundle*) yang dapat dijalankan ulang kapan saja menggunakan skrip [scripts/generate-proof.mjs](../scripts/generate-proof.mjs). Seluruh berkas keluaran mentah tersimpan di folder [proof/](../proof/).

---

## Cara Menjalankan Ulang Seluruh Bukti
```bash
npm install
npm test                    # 124 automated tests (Vitest + Supertest)
npm run verify -w backend   # 58 pemeriksaan rute API, RBAC, dan integritas data
npm run build               # Type-check strict TypeScript (backend & frontend) + Vite bundle
npm run proof               # Regenerasi seluruh artefak bukti di folder proof/
```

---

## Daftar Artefak Bukti di Folder `proof/`

| Berkas | Isi & Apa yang Dibuktikan |
| :--- | :--- |
| [proof/SUMMARY.md](../proof/SUMMARY.md) | Ringkasan eksekutif hasil seluruh pemeriksaan (waktu eksekusi, versi Node/npm, status 124 test, 58 verify checks, dan build). |
| [proof/00-lingkungan.txt](../proof/00-lingkungan.txt) | Versi Node.js, npm, sistem operasi, dan daftar berkas sumber otoritatif di `data/`. |
| [proof/01-impor.txt](../proof/01-impor.txt) | Output impor startup dari `02_Project_Master.csv`, `03_Project_Updates.csv`, `04_Production_Data.json` (6 masters, 23 updates, 12 production records, 0 quarantined) + bukti idempoten refresh. |
| [proof/02-evaluasi.txt](../proof/02-evaluasi.txt) | Ringkasan keluaran evaluasi deterministik seluruh 6 proyek (`PRJ-001` s/d `PRJ-006`) pada `As-Of: 2026-10-06T17:00:00`: attention level, uncertainty, feasibility verdict, angka reported vs operational, laju wajib, proyeksi slip, sinyal aktif, dan unknowns. |
| [proof/03-test.txt](../proof/03-test.txt) | Keluaran penuh eksekusi `npm test` (**5 test files, 124 passed, 0 failed**). |
| [proof/04-verifikasi.txt](../proof/04-verifikasi.txt) | Keluaran penuh eksekusi `npm run verify -w backend` (**58/58 passed, 0 failed** — mencakup integritas data, 6 proyek, seluruh rute REST API, Section 11 Evidence-Based Closure, dan Persona RBAC). |
| [proof/05-build.txt](../proof/05-build.txt) | Keluaran penuh eksekusi `npm run build` (`tsc` backend + `tsc -b && vite build` frontend). |
| [proof/portfolio-snapshot.json](../proof/portfolio-snapshot.json) | Dump JSON lengkap hasil `GET /api/portfolio` per `2026-10-06T17:00:00` untuk inspeksi audit langsung. |

---

## Catatan Transparansi Batasan Bukti
1. Seluruh artefak di `proof/` membuktikan kebenaran fungsional pada dataset sintetis 6 proyek serta proyek sintetis uji (`PRJ-999-CUSTOM`).
2. Klaim arsitektur mengenai bottleneck **501 kueri (pola N+1) untuk 500 proyek** dianalisis secara struktural dari kode `GET /api/portfolio` (1 kueri master + kueri per proyek), **belum dilakukan uji beban (*load test*)** pada 500 proyek nyata.
3. Berkas `07_OnTrack_Requirements_and_Data.xlsx` tidak dibandingkan secara otomatis oleh skrip karena sesuai `06_Submission_Guide.txt`, berkas CSV dan JSON merupakan sumber input otoritatif.
