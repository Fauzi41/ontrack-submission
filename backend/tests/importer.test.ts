import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { inMemoryDb } from '../src/db/db.js';
import { currentAsOf, runImport } from '../src/ingest/importer.js';
import { loadFacts, readAsOf } from '../src/interpret/load.js';
import { DATA_DIR, FIXTURES } from '../src/config.js';

function copyFixtures(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ontrack-test-'));
  for (const f of [FIXTURES.master, FIXTURES.updates, FIXTURES.production]) {
    writeFileSync(join(dir, f), readFileSync(join(DATA_DIR, f), 'utf8'));
  }
  return dir;
}

describe('impor', () => {
  it('memuat seluruh fixture tanpa menolak baris', () => {
    const db = inMemoryDb();
    const report = runImport(db, { dataDir: copyFixtures() });
    expect(report.inserted).toBe(41);
    expect(report.rejected).toBe(0);
    expect(report.issues).toEqual([]);
    expect(loadFacts(db)).toHaveLength(6);
  });

  it('idempoten: impor kedua tidak menggandakan apa pun', () => {
    const dir = copyFixtures();
    const db = inMemoryDb();
    runImport(db, { dataDir: dir });
    const second = runImport(db, { dataDir: dir });
    expect(second.inserted).toBe(0);
    expect(second.duplicates).toBe(41);
    expect(second.updated).toBe(0);
  });

  it('memakai generated_at dataset sebagai as_of, bukan jam mesin', () => {
    const db = inMemoryDb();
    runImport(db, { dataDir: copyFixtures() });
    expect(readAsOf(db)).toBe('2026-10-06T17:00:00');
  });

  it('menyimpan isi lama saat record berubah, dan tidak membuangnya', () => {
    const dir = copyFixtures();
    const db = inMemoryDb();
    runImport(db, { dataDir: dir });

    const path = join(dir, FIXTURES.updates);
    const lines = readFileSync(path, 'utf8').split(/\r?\n/).filter(Boolean);
    const body = lines.slice(1);
    const idx = body.findIndex((l) => l.startsWith('UPD-002,'));
    const cols = body[idx]!.split(',');
    cols[cols.length - 1] = 'Kalimat ini diubah pada impor kedua.';
    body[idx] = cols.join(',');
    writeFileSync(path, [lines[0]!, ...body].join('\n'));

    const second = runImport(db, { dataDir: dir });
    expect(second.updated).toBe(1);

    const version = db
      .prepare("SELECT reason, raw_json FROM record_versions WHERE source_ref_id = 'UPD-002'")
      .get() as { reason: string; raw_json: string } | undefined;
    expect(version?.reason).toBe('SUPERSEDED');
    expect(version?.raw_json).not.toContain('diubah pada impor kedua');
  });

  it('tidak menimpa dengan versi yang lebih tua, tapi tetap menyimpannya', () => {
    const dir = copyFixtures();
    const db = inMemoryDb();
    runImport(db, { dataDir: dir });

    const path = join(dir, FIXTURES.updates);
    const original = readFileSync(path, 'utf8');
    writeFileSync(
      path,
      `${original}\nUPD-003,PRJ-006,2026-09-01T08:00:00,PROJECT_MANAGER,Maya,"Versi lama yang baru sampai sekarang."`,
    );

    const second = runImport(db, { dataDir: dir });
    expect(second.late_arrivals).toBe(1);
    expect(second.issues.map((i) => i.code)).toContain('LATE_ARRIVAL');

    const active = db
      .prepare("SELECT observed_at FROM source_records WHERE source_ref_id = 'UPD-003'")
      .get() as { observed_at: string };
    expect(active.observed_at).toBe('2026-09-30T16:00:00');

    const version = db
      .prepare("SELECT reason FROM record_versions WHERE source_ref_id = 'UPD-003'")
      .get() as { reason: string } | undefined;
    expect(version?.reason).toBe('LATE_ARRIVAL');
  });

  it('menolak baris cacat dan menyebut nomor baris aslinya', () => {
    const dir = copyFixtures();
    const db = inMemoryDb();
    const path = join(dir, FIXTURES.updates);
    const original = readFileSync(path, 'utf8');
    writeFileSync(path, `${original}\nUPD-404,PRJ-001,2026-10-01T10:00:00,PROJECT_MANAGER,"kolom kurang"`);

    const report = runImport(db, { dataDir: dir });
    expect(report.rejected).toBe(1);
    const issue = report.issues.find((i) => i.code === 'COLUMN_COUNT_MISMATCH');
    expect(issue?.message).toContain('Updates baris');
    expect(report.inserted).toBe(41);
  });
});

describe('impor yang tidak bersih', () => {
  it('mencatat update untuk proyek yang tidak ada di master sebagai orphan', () => {
    const dir = copyFixtures();
    const db = inMemoryDb();
    const path = join(dir, FIXTURES.updates);
    writeFileSync(
      path,
      `${readFileSync(path, 'utf8')}\nUPD-777,PRJ-999,2026-10-01T10:00:00,PROJECT_MANAGER,Nadia,"Proyek hantu."`,
    );
    const report = runImport(db, { dataDir: dir });
    expect(report.orphans).toBe(1);
    expect(report.issues.map((i) => i.code)).toContain('ORPHAN_PROJECT');
  });

  it('berhenti sebelum menyentuh data bila header tidak sesuai', () => {
    const dir = copyFixtures();
    const db = inMemoryDb();
    writeFileSync(join(dir, FIXTURES.updates), 'update_id,project_id,timestamp\nUPD-1,PRJ-001,2026-10-01T10:00:00\n');
    expect(() => runImport(db, { dataDir: dir })).toThrow();
    const count = db.prepare('SELECT count(*) AS c FROM source_records').get() as { c: number };
    expect(count.c).toBe(0);
  });

  it('berhenti dengan pesan yang jelas saat JSON produksi rusak', () => {
    const dir = copyFixtures();
    writeFileSync(join(dir, FIXTURES.production), '{rusak');
    expect(() => runImport(inMemoryDb(), { dataDir: dir })).toThrow(/tidak dapat dibaca/);
  });

  it('mencatat angka tak terbaca tanpa menghentikan impor', () => {
    const dir = copyFixtures();
    const db = inMemoryDb();
    const path = join(dir, FIXTURES.master);
    writeFileSync(path, readFileSync(path, 'utf8').replace(',400,', ',empat ratus,'));
    const report = runImport(db, { dataDir: dir });
    expect(report.issues.map((i) => i.code)).toContain('UNREADABLE_NUMBER');
    expect(report.rejected).toBe(0);
  });
});

describe('aturan tipe proyek', () => {
  it('mengisi tabel aturan sekali dan membacanya kembali', () => {
    const db = inMemoryDb();
    runImport(db, { dataDir: DATA_DIR });
    const count = db.prepare('SELECT count(*) AS c FROM project_types').get() as { c: number };
    expect(count.c).toBe(5);
    expect(currentAsOf(db)).toBe('2026-10-06T17:00:00');
  });

  it('memakai aturan default untuk tipe yang belum dikenal, bukan menebak', () => {
    const db = inMemoryDb();
    runImport(db, { dataDir: DATA_DIR });
    db.prepare(
      `INSERT INTO projects (project_id, customer, project_name, project_type, pic, start_date, deadline, target, target_unit,
        reported_actual, reported_progress_pct, reported_status, last_reported_update_at, active, first_seen_at, last_ingested_at)
       VALUES ('PRJ-NEW','C','Baru','Tipe Baru',NULL,'2026-09-01','2026-10-15',100,'ML',10,10,'ON TRACK',NULL,1,'x','x')`,
    ).run();
    const loaded = loadFacts(db).find((f) => f.project.project_id === 'PRJ-NEW');
    expect(loaded?.rule.progress_basis).toBe('validated_quantity');
    expect(loaded?.rule.rate_model).toBe('flow');
    expect(loaded?.rule.expected_cadence_hours).toBe(72);
  });
});
