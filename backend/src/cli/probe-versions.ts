/**
 * Membuktikan tabel record_versions benar-benar bekerja.
 *
 * Impor pertama tidak menulis versi apa pun, karena semua record masih baru.
 * Skrip ini lalu mengubah dua record pada salinan fixture: satu dengan waktu
 * lebih baru (harus menggantikan yang lama) dan satu dengan waktu lebih lama
 * (harus ditolak, record lama dipertahankan). Setelah impor kedua, isi tabel
 * versi dicetak apa adanya.
 *
 * Fixture asli tidak disentuh karena semuanya bekerja pada salinan di direktori
 * sementara.
 */
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DATA_DIR, FIXTURES } from '../config.js';
import { openDb } from '../db/db.js';
import { runImport } from '../ingest/importer.js';

const dir = mkdtempSync(join(tmpdir(), 'ontrack-versions-'));
for (const name of Object.values(FIXTURES)) {
  copyFileSync(join(DATA_DIR, name), join(dir, name));
}

const productionPath = join(dir, FIXTURES.production);
type ProdRecord = {
  source_record_id: string;
  timestamp: string;
  [key: string]: unknown;
};
const production = JSON.parse(readFileSync(productionPath, 'utf8')) as { records: ProdRecord[] };

const db = openDb(join(dir, 'versions.db'));
const first = runImport(db, { dataDir: dir });
const versionsAfterFirst = count(db);

function patch(id: string, changes: Partial<ProdRecord>): void {
  const record = production.records.find((r) => r.source_record_id === id);
  if (!record) throw new Error(`record ${id} tidak ada di fixture`);
  Object.assign(record, changes);
}

// Baru setelah impor pertama, dua record diubah pada salinan fixture.
// Lebih baru: harus menggantikan angka lama dan menyimpan versi lama.
patch('PROD-ALPHA-001', { timestamp: '2026-10-06T09:00:00', verified_quantity: 312.75 });
// Lebih lama: harus ditolak sebagai data terlambat, angka berjalan tidak berubah.
patch('WH-GAMMA-001', { timestamp: '2026-09-29T08:00:00', processed_boxes: 1500 });

writeFileSync(productionPath, JSON.stringify(production, null, 2), 'utf8');

const second = runImport(db, { dataDir: dir });

type VersionRow = {
  source_kind: string;
  source_ref_id: string;
  project_id: string;
  observed_at: string;
  reason: string;
  current_record_id: number | null;
};
const versions = db
  .prepare(
    `SELECT source_kind, source_ref_id, project_id, observed_at, reason, current_record_id
     FROM record_versions ORDER BY id`,
  )
  .all() as VersionRow[];

const alpha = db
  .prepare(
    `SELECT r.raw_json FROM source_records r
     WHERE r.source_ref_id = 'PROD-ALPHA-001'`,
  )
  .get() as { raw_json: string };
const gamma = db
  .prepare(
    `SELECT r.raw_json FROM source_records r
     WHERE r.source_ref_id = 'WH-GAMMA-001'`,
  )
  .get() as { raw_json: string };

const alphaValue = (JSON.parse(alpha.raw_json) as { verified_quantity?: number }).verified_quantity;
const gammaValue = (JSON.parse(gamma.raw_json) as { processed_boxes?: number }).processed_boxes;

const checks: Array<[string, string, string]> = [
  ['impor pertama tidak menulis versi', '0', String(versionsAfterFirst)],
  ['impor kedua menulis versi', '2', String(versions.length)],
  ['record lebih baru digantikan', '312.75', String(alphaValue)],
  ['record lebih lama ditolak', '1840', String(gammaValue)],
  ['versi menyimpan record lama', 'ya', versions.some((v) => v.reason === 'SUPERSEDED') ? 'ya' : 'tidak'],
  ['versi menandai data terlambat', 'ya', versions.some((v) => v.reason === 'LATE_ARRIVAL') ? 'ya' : 'tidak'],
];

let failed = 0;
for (const [name, want, got] of checks) {
  const ok = want === got;
  if (!ok) failed += 1;
  console.log(`${ok ? 'OK  ' : 'GAGAL'}  ${name}  (ingin ${want}, dapat ${got})`);
}

console.log('\nIsi record_versions:');
for (const v of versions) {
  console.log(
    `  ${v.reason.padEnd(13)} ${v.source_ref_id.padEnd(14)} ${v.project_id}  observed ${v.observed_at}  record saat ini #${v.current_record_id}`,
  );
}

console.log(`\nimpor pertama: ${first.inserted} baris baru. Impor kedua: ${second.updated} diubah, ${second.late_arrivals} terlambat, ${second.duplicates} duplikat.`);

db.close();
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  // Windows kadang menahan handle sesaat
}

function count(db: ReturnType<typeof openDb>): number {
  return (db.prepare('SELECT COUNT(*) c FROM record_versions').get() as { c: number }).c;
}

if (failed > 0) process.exitCode = 1;
