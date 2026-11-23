/**
 * Membandingkan basis data kerja dengan hasil impor bersih.
 * Hanya membaca; tidak menulis apa pun.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DB_PATH } from '../config.js';
import { openDb } from '../db/db.js';
import { runImport } from '../ingest/importer.js';

const live = openDb(DB_PATH);
const dir = mkdtempSync(join(tmpdir(), 'ontrack-audit-'));
const clean = openDb(join(dir, 'clean.db'));
runImport(clean);

const TABLES = [
  'projects',
  'project_types',
  'source_records',
  'observation_values',
  'record_versions',
  'issues',
  'followups',
  'followup_events',
  'finding_responses',
  'import_runs',
  'ingest_issues',
  'deadline_history',
];

const count = (db: ReturnType<typeof openDb>, table: string): number =>
  (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;

console.log('tabel                  kerja  bersih  selisih');
for (const table of TABLES) {
  const a = count(live, table);
  const b = count(clean, table);
  const diff = a - b;
  console.log(`${table.padEnd(22)} ${String(a).padStart(5)} ${String(b).padStart(7)} ${diff === 0 ? '' : (diff > 0 ? '+' : '') + diff}`);
}

const statuses = (db: ReturnType<typeof openDb>) =>
  db.prepare('SELECT status, COUNT(*) AS c FROM issues GROUP BY status ORDER BY status').all() as Array<{ status: string; c: number }>;
console.log('\nstatus isu kerja  :', statuses(live).map((s) => `${s.status} ${s.c}`).join(', '));
console.log('status isu bersih :', statuses(clean).map((s) => `${s.status} ${s.c}`).join(', '));

const changed = live
  .prepare(
    `SELECT i.id, i.project_id, i.fingerprint, i.status, i.resolved_by_record, i.reopen_count
     FROM issues i JOIN issues c ON c.id = i.id
     WHERE i.status != 'OPEN' ORDER BY i.id`,
  )
  .all() as Array<Record<string, unknown>>;
console.log('\nisu yang tidak lagi OPEN di basis data kerja:');
if (changed.length === 0) console.log('  (tidak ada)');
for (const row of changed) console.log(`  #${row.id} ${row.project_id} ${row.fingerprint} -> ${row.status} bukti=${row.resolved_by_record ?? '-'}`);

const followups = live.prepare('SELECT * FROM followups ORDER BY rowid').all() as Array<Record<string, unknown>>;
console.log(`\nfollow-up: ${followups.length}`);
for (const f of followups) console.log(`  ${f.id} ${f.project_id} "${f.title}" ${f.owner} ${f.status}`);

const responses = live
  .prepare('SELECT id, project_id, fingerprint, kind, actor, note, review_decision, reviewed_by FROM finding_responses ORDER BY id')
  .all() as Array<Record<string, unknown>>;
console.log(`\ntanggapan: ${responses.length}`);
for (const r of responses) {
  console.log(`  #${r.id} ${r.project_id} ${r.fingerprint} ${r.kind} oleh ${r.actor}${r.review_decision ? ` -> ${r.review_decision} oleh ${r.reviewed_by}` : ' -> menunggu'}`);
}

const runs = live.prepare('SELECT id, started_at, inserted, duplicates, updated, late_arrivals FROM import_runs ORDER BY id').all() as Array<
  Record<string, unknown>
>;
console.log(`\nriwayat impor: ${runs.length}`);
for (const r of runs) {
  console.log(`  #${r.id} ${r.started_at} baru=${r.inserted} duplikat=${r.duplicates} diubah=${r.updated} terlambat=${r.late_arrivals}`);
}

const versions = live.prepare('SELECT reason, COUNT(*) AS c FROM record_versions GROUP BY reason').all() as Array<{ reason: string; c: number }>;
console.log('\nrecord_versions:', versions.length === 0 ? 'kosong' : versions.map((v) => `${v.reason} ${v.c}`).join(', '));

live.close();
clean.close();
try {
  rmSync(dir, { recursive: true, force: true });
} catch {
  /* Windows kadang menahan handle sebentar */
}
