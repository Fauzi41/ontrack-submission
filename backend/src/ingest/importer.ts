import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, FIXTURES } from '../config';
import { DB, getMeta, setMeta } from '../db/db';
import { parseCsv, toObjects } from './csv';
import {
  Normalized,
  NormalizeIssue,
  ProjectInput,
  normalizeMasterRow,
  normalizeProductionRecord,
  normalizeUpdateRow,
} from './normalize';

export interface ImportIssue {
  severity: 'ERROR' | 'WARN' | 'INFO';
  code: string;
  message: string;
  project_id?: string | null;
  source_ref_id?: string | null;
}

export interface ImportInventory {
  projects: number;
  updates: number;
  production: number;
  sourceRecords: number;
  observationValues: number;
}

export interface ImportReport {
  started_at: string;
  finished_at: string;
  as_of: string | null;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  late_arrivals: number;
  orphans: number;
  issues: ImportIssue[];
  inventory: ImportInventory;
}

export class ImportError extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = 'ImportError';
  }
}

interface Counters {
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  late_arrivals: number;
  orphans: number;
}

function readFixture(dir: string, name: string): string {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) {
    throw new ImportError(`fixture tidak ditemukan: ${file}`, 'FIXTURE_MISSING');
  }
  return fs.readFileSync(file, 'utf8');
}

function requireHeaders(kind: string, header: string[], required: string[]): void {
  const missing = required.filter((h) => !header.includes(h));
  if (missing.length > 0) {
    throw new ImportError(`${kind}: kolom wajib tidak ada — ${missing.join(', ')}`, 'MISSING_COLUMNS');
  }
}

export function runImport(db: DB, opts: { dataDir?: string } = {}): ImportReport {
  const dataDir = opts.dataDir ?? DATA_DIR;
  const startedAt = new Date().toISOString();

  // --- Baca & validasi level-file lebih dulu: kalau gagal, state lama utuh ---
  const masterText = readFixture(dataDir, FIXTURES.master);
  const updatesText = readFixture(dataDir, FIXTURES.updates);
  const productionText = readFixture(dataDir, FIXTURES.production);

  const masterCsv = parseCsv(masterText);
  const updatesCsv = parseCsv(updatesText);
  requireHeaders('Project Master', masterCsv.header, ['project_id', 'target', 'reported_actual', 'reported_progress_pct', 'deadline']);
  requireHeaders('Project Updates', updatesCsv.header, ['update_id', 'project_id', 'timestamp', 'source_type', 'message']);

  let productionDoc: { generated_at?: string; records?: unknown[] };
  try {
    productionDoc = JSON.parse(productionText) as { generated_at?: string; records?: unknown[] };
  } catch (err) {
    throw new ImportError(`JSON produksi tidak dapat dibaca: ${(err as Error).message}`, 'BAD_JSON');
  }
  if (!Array.isArray(productionDoc.records)) {
    throw new ImportError('JSON produksi tidak memiliki array "records"', 'BAD_JSON_SHAPE');
  }

  const issues: ImportIssue[] = [
    ...masterCsv.malformed.map((m) => ({ severity: 'WARN' as const, code: m.code, message: `Master baris ${m.line}: ${m.message}` })),
    ...updatesCsv.malformed.map((m) => ({ severity: 'WARN' as const, code: m.code, message: `Updates baris ${m.line}: ${m.message}` })),
  ];
  const counters: Counters = { inserted: 0, updated: 0, duplicates: 0, rejected: 0, late_arrivals: 0, orphans: 0 };

  const selRecord = db.prepare(
    'SELECT id, observed_at, raw_json FROM source_records WHERE source_kind = ? AND source_ref_id = ?',
  );
  const insRecord = db.prepare(
    `INSERT INTO source_records
       (project_id, source_kind, provenance, source_ref_id, source_system, source_name, record_type, observed_at, ingested_at, raw_json)
     VALUES (@project_id, @source_kind, @provenance, @source_ref_id, @source_system, @source_name, @record_type, @observed_at, @ingested_at, @raw_json)`,
  );
  const updRecord = db.prepare(
    `UPDATE source_records SET project_id=@project_id, source_system=@source_system, source_name=@source_name,
       record_type=@record_type, observed_at=@observed_at, ingested_at=@ingested_at, raw_json=@raw_json
     WHERE id=@id`,
  );
  const delValues = db.prepare('DELETE FROM observation_values WHERE record_id = ?');
  const insValue = db.prepare(
    `INSERT INTO observation_values
       (record_id, project_id, metric, unit, value_num, value_text, presence, workflow_state, observed_at, ingested_at)
     VALUES (@record_id, @project_id, @metric, @unit, @value_num, @value_text, @presence, @workflow_state, @observed_at, @ingested_at)`,
  );
  const selProject = db.prepare('SELECT project_id, last_reported_update_at, deadline FROM projects WHERE project_id = ?');
  const insProject = db.prepare(
    `INSERT INTO projects (project_id, customer, project_name, project_type, pic, start_date, deadline, target, target_unit,
       reported_actual, reported_progress_pct, reported_status, last_reported_update_at, active, first_seen_at, last_ingested_at)
     VALUES (@project_id, @customer, @project_name, @project_type, @pic, @start_date, @deadline, @target, @target_unit,
       @reported_actual, @reported_progress_pct, @reported_status, @last_reported_update_at, 1, @now, @now)`,
  );
  const updProject = db.prepare(
    `UPDATE projects SET customer=@customer, project_name=@project_name, project_type=@project_type, pic=@pic,
       start_date=@start_date, deadline=@deadline, target=@target, target_unit=@target_unit,
       reported_actual=@reported_actual, reported_progress_pct=@reported_progress_pct, reported_status=@reported_status,
       last_reported_update_at=@last_reported_update_at, active=1, last_ingested_at=@now
     WHERE project_id=@project_id`,
  );
  const insDeadline = db.prepare(
    'INSERT INTO deadline_history (project_id, changed_at, from_date, to_date) VALUES (?, ?, ?, ?)',
  );

  /** Simpan satu record + nilainya, dengan kebijakan duplikat/data-terlambat. */
  function persistRecord(norm: Normalized, ingestedAt: string): void {
    const { record, values } = norm;
    const payload = { ...record, ingested_at: ingestedAt };
    const existing = selRecord.get(record.source_kind, record.source_ref_id) as
      | { id: number; observed_at: string | null; raw_json: string }
      | undefined;

    let recordId: number;
    if (!existing) {
      const info = insRecord.run(payload);
      recordId = Number(info.lastInsertRowid);
      counters.inserted++;
    } else if (existing.raw_json === record.raw_json) {
      counters.duplicates++;
      return;
    } else if (
      existing.observed_at &&
      record.observed_at &&
      record.observed_at < existing.observed_at
    ) {
      counters.late_arrivals++;
      db.prepare('UPDATE source_records SET is_late_arrival = 1 WHERE id = ?').run(existing.id);
      issues.push({
        severity: 'WARN',
        code: 'LATE_ARRIVAL',
        message: `${record.source_ref_id}: record lebih tua (${record.observed_at}) dari yang tersimpan (${existing.observed_at}); tidak menimpa`,
        project_id: record.project_id,
        source_ref_id: record.source_ref_id,
      });
      return;
    } else {
      updRecord.run({ ...payload, id: existing.id });
      delValues.run(existing.id);
      recordId = existing.id;
      counters.updated++;
    }

    for (const v of values) {
      insValue.run({
        record_id: recordId,
        project_id: record.project_id,
        metric: v.metric,
        unit: v.unit,
        value_num: v.value_num,
        value_text: v.value_text,
        presence: v.presence,
        workflow_state: v.workflow_state,
        observed_at: v.observed_at,
        ingested_at: ingestedAt,
      });
    }
  }

  function persistProjects(projects: ProjectInput[], ingestedAt: string): void {
    const seen = new Map<string, string | null>();
    for (const p of projects) {
      if (seen.has(p.project_id)) {
        issues.push({
          severity: 'WARN',
          code: 'DUPLICATE_MASTER_ROW',
          message: `${p.project_id} muncul lebih dari sekali di master; menang last_reported_update_at terbaru`,
          project_id: p.project_id,
        });
      }
      if (!p.last_reported_update_at) {
        issues.push({
          severity: 'WARN',
          code: 'MASTER_WITHOUT_TIMESTAMP',
          message: `${p.project_id}: last_reported_update_at kosong; urutan data tidak dapat dipastikan`,
          project_id: p.project_id,
        });
      }
      seen.set(p.project_id, p.last_reported_update_at);

      const prev = selProject.get(p.project_id) as
        | { project_id: string; last_reported_update_at: string | null; deadline: string | null }
        | undefined;
      const row = { ...p, now: ingestedAt };

      if (!prev) {
        insProject.run(row);
        continue;
      }
      if (prev.last_reported_update_at && p.last_reported_update_at && p.last_reported_update_at < prev.last_reported_update_at) {
        counters.rejected++;
        issues.push({
          severity: 'WARN',
          code: 'MASTER_STALE',
          message: `${p.project_id}: master lebih tua (${p.last_reported_update_at}) dari tersimpan (${prev.last_reported_update_at}); tidak menimpa`,
          project_id: p.project_id,
        });
        continue;
      }
      if (prev.deadline && p.deadline && prev.deadline !== p.deadline) {
        insDeadline.run(p.project_id, ingestedAt, prev.deadline, p.deadline);
      }
      updProject.run(row);
    }
  }

  const ingestedAt = new Date().toISOString();

  const writeAll = db.transaction(() => {
    // ---- Master ----
    const masterRows = toObjects(masterCsv.header, masterCsv.rows);
    const normMaster = masterRows.map((r) => normalizeMasterRow(r, ingestedAt));
    for (const n of normMaster) {
      if (!n.ok) {
        counters.rejected++;
        issues.push(...n.issues.map((i) => ({ ...i, project_id: i.source_ref_id ?? null })));
      }
    }
    persistProjects(
      normMaster.map((n) => n.normalized?.project).filter((p): p is ProjectInput => Boolean(p)),
      ingestedAt,
    );

    const knownProjects = new Set(
      (db.prepare('SELECT project_id FROM projects').all() as Array<{ project_id: string }>).map((r) => r.project_id),
    );

    for (const n of normMaster) {
      if (!n.normalized) continue;
      persistRecord(n.normalized, ingestedAt);
    }

    // ---- Updates ----
    const updateRows = toObjects(updatesCsv.header, updatesCsv.rows);
    for (const r of updateRows) {
      const n = normalizeUpdateRow(r, ingestedAt);
      if (!n.ok || !n.normalized) {
        counters.rejected++;
        issues.push(...n.issues);
        continue;
      }
      if (!knownProjects.has(n.normalized.record.project_id)) {
        counters.orphans++;
        issues.push({
          severity: 'WARN',
          code: 'ORPHAN_PROJECT',
          message: `${n.normalized.record.source_ref_id}: project_id ${n.normalized.record.project_id} tidak ada di master`,
          project_id: n.normalized.record.project_id,
          source_ref_id: n.normalized.record.source_ref_id,
        });
      }
      issues.push(...n.issues.map((i) => ({ ...i, project_id: n.normalized!.record.project_id })));
      persistRecord(n.normalized, ingestedAt);
    }

    // ---- Production ----
    for (const rec of productionDoc.records as Array<Record<string, unknown>>) {
      const n = normalizeProductionRecord(rec, ingestedAt);
      if (!n.ok || !n.normalized) {
        counters.rejected++;
        issues.push(...n.issues);
        continue;
      }
      if (!knownProjects.has(n.normalized.record.project_id)) {
        counters.orphans++;
        issues.push({
          severity: 'WARN',
          code: 'ORPHAN_PROJECT',
          message: `${n.normalized.record.source_ref_id}: project_id ${n.normalized.record.project_id} tidak ada di master`,
          project_id: n.normalized.record.project_id,
          source_ref_id: n.normalized.record.source_ref_id,
        });
      }
      persistRecord(n.normalized, ingestedAt);
    }
  });

  writeAll();

  // ---- as_of: pakai generated_at dataset; fallback ke observasi terbaru ----
  const maxObserved = db
    .prepare("SELECT MAX(observed_at) AS m FROM source_records WHERE observed_at IS NOT NULL")
    .get() as { m: string | null };
  const asOf = productionDoc.generated_at ?? maxObserved.m ?? null;
  if (asOf) setMeta(db, 'as_of', asOf);

  const inventory: ImportInventory = {
    projects: (db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c,
    updates: (db.prepare("SELECT COUNT(*) AS c FROM source_records WHERE source_kind='UPDATE'").get() as { c: number }).c,
    production: (db.prepare("SELECT COUNT(*) AS c FROM source_records WHERE source_kind='PRODUCTION'").get() as { c: number }).c,
    sourceRecords: (db.prepare('SELECT COUNT(*) AS c FROM source_records').get() as { c: number }).c,
    observationValues: (db.prepare('SELECT COUNT(*) AS c FROM observation_values').get() as { c: number }).c,
  };

  const finishedAt = new Date().toISOString();
  const report: ImportReport = {
    started_at: startedAt,
    finished_at: finishedAt,
    as_of: asOf,
    ...counters,
    issues,
    inventory,
  };

  const info = db
    .prepare(
      `INSERT INTO import_runs (started_at, finished_at, as_of, inserted, updated, duplicates, rejected, late_arrivals, orphans, report_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(startedAt, finishedAt, asOf, counters.inserted, counters.updated, counters.duplicates, counters.rejected, counters.late_arrivals, counters.orphans, JSON.stringify(report));

  const runId = Number(info.lastInsertRowid);
  const insIssue = db.prepare(
    'INSERT INTO ingest_issues (run_id, severity, code, project_id, source_ref_id, message) VALUES (?, ?, ?, ?, ?, ?)',
  );
  for (const i of issues) insIssue.run(runId, i.severity, i.code, i.project_id ?? null, i.source_ref_id ?? null, i.message);

  return report;
}

export function currentAsOf(db: DB): string | null {
  return getMeta(db, 'as_of');
}
