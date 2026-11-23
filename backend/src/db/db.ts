import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { DB_PATH, PROJECT_TYPE_RULES } from '../config';

const here = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');

export type DB = Database.Database;

export function openDb(dbPath: string = DB_PATH): DB {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  migrate(db);
  seedProjectTypes(db);
  return db;
}

/**
 * `CREATE TABLE IF NOT EXISTS` tidak menambah kolom pada tabel yang sudah ada,
 * jadi kolom baru ditambahkan di sini. Aman dijalankan berkali-kali.
 */
function migrate(db: DB): void {
  const columns = new Set(
    (db.prepare('PRAGMA table_info(finding_responses)').all() as Array<{ name: string }>).map((c) => c.name),
  );
  const additions: Array<[string, string]> = [
    ['reviewed_at', 'TEXT'],
    ['reviewed_by', 'TEXT'],
    ['review_decision', 'TEXT'],
    ['review_note', 'TEXT'],
  ];
  for (const [name, type] of additions) {
    if (!columns.has(name)) db.exec(`ALTER TABLE finding_responses ADD COLUMN ${name} ${type}`);
  }
}

export function inMemoryDb(): DB {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA_SQL);
  seedProjectTypes(db);
  return db;
}

/** Aturan tipe dimuat dari config, bukan ditulis ke kode detector. */
export function seedProjectTypes(db: DB): void {
  const stmt = db.prepare(
    `INSERT INTO project_types (project_type, progress_basis, rate_model, expected_cadence_hours, note)
     VALUES (@project_type, @progress_basis, @rate_model, @expected_cadence_hours, @note)
     ON CONFLICT(project_type) DO UPDATE SET
       progress_basis = excluded.progress_basis,
       rate_model = excluded.rate_model,
       expected_cadence_hours = excluded.expected_cadence_hours,
       note = excluded.note`,
  );
  const tx = db.transaction(() => {
    for (const rule of PROJECT_TYPE_RULES) stmt.run(rule);
  });
  tx();
}

export function getMeta(db: DB, key: string): string | null {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setMeta(db: DB, key: string, value: string): void {
  db.prepare(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value);
}
