import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import {
  parseProductionDataJson,
  parseProjectMasterCsv,
  parseProjectUpdatesCsv,
} from './parsers.js';
import type {
  FollowUpActionStatus,
  FollowUpHistoryEntry,
  FollowUpRecord,
  FollowUpVerificationStatus,
  IngestionRunSummary,
  IngestionWarning,
  ProductionEvidenceRecord,
  ProjectMasterRecord,
  ProjectUpdateRecord,
} from './types.js';

export const DEFAULT_AS_OF_DATE = '2026-10-06T17:00:00';

function sha256(obj: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

export class OnTrackDatabase {
  public readonly db: DatabaseSync;
  public readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS source_masters (
        project_id TEXT PRIMARY KEY,
        customer TEXT NOT NULL,
        project_name TEXT NOT NULL,
        project_type TEXT NOT NULL,
        pic TEXT NOT NULL,
        start_date TEXT NOT NULL,
        deadline TEXT NOT NULL,
        target REAL NOT NULL,
        target_unit TEXT NOT NULL,
        reported_actual REAL NOT NULL,
        reported_progress_pct REAL NOT NULL,
        reported_status TEXT NOT NULL,
        last_reported_update_at TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_updates (
        update_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        source_type TEXT NOT NULL,
        source_name TEXT NOT NULL,
        message TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS source_production (
        source_record_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        source_system TEXT NOT NULL,
        record_type TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        raw_payload_json TEXT NOT NULL,
        payload_hash TEXT NOT NULL,
        ingested_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS follow_ups (
        followup_id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        owner TEXT NOT NULL,
        priority TEXT NOT NULL DEFAULT 'MEDIUM',
        action_status TEXT NOT NULL DEFAULT 'OPEN',
        verification_status TEXT NOT NULL DEFAULT 'NOT_APPLICABLE',
        due_date TEXT,
        linked_signal_code TEXT,
        evidence_refs_json TEXT NOT NULL DEFAULT '[]',
        verification_evidence_ref TEXT,
        verification_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        resolved_at TEXT
      );

      CREATE TABLE IF NOT EXISTS follow_up_history (
        history_id INTEGER PRIMARY KEY AUTOINCREMENT,
        followup_id TEXT NOT NULL,
        from_status TEXT,
        to_status TEXT NOT NULL,
        verification_status TEXT NOT NULL,
        actor TEXT NOT NULL,
        note TEXT NOT NULL,
        evidence_ref TEXT,
        changed_at TEXT NOT NULL,
        FOREIGN KEY (followup_id) REFERENCES follow_ups(followup_id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS ingestion_runs (
        run_id TEXT PRIMARY KEY,
        trigger_type TEXT NOT NULL,
        executed_at TEXT NOT NULL,
        summary_json TEXT NOT NULL
      );
    `);
  }

  public close(): void {
    this.db.close();
  }

  public ingestFromDirectory(
    dataDir: string,
    trigger: 'STARTUP' | 'DISK_REFRESH' = 'DISK_REFRESH'
  ): IngestionRunSummary {
    const warnings: IngestionWarning[] = [];
    const masterPath = path.join(dataDir, '02_Project_Master.csv');
    const updatesPath = path.join(dataDir, '03_Project_Updates.csv');
    const prodPath = path.join(dataDir, '04_Production_Data.json');

    let masterCsv: string | undefined;
    let updatesCsv: string | undefined;
    let prodJson: string | undefined;

    if (fs.existsSync(masterPath)) {
      masterCsv = fs.readFileSync(masterPath, 'utf-8');
    } else {
      warnings.push({
        source_file: '02_Project_Master.csv',
        record_ref: 'FILE',
        severity: 'ERROR',
        code: 'FILE_NOT_FOUND',
        message: `Source file not found at ${masterPath}`,
      });
    }

    if (fs.existsSync(updatesPath)) {
      updatesCsv = fs.readFileSync(updatesPath, 'utf-8');
    } else {
      warnings.push({
        source_file: '03_Project_Updates.csv',
        record_ref: 'FILE',
        severity: 'WARNING',
        code: 'FILE_NOT_FOUND',
        message: `Source file not found at ${updatesPath}`,
      });
    }

    if (fs.existsSync(prodPath)) {
      prodJson = fs.readFileSync(prodPath, 'utf-8');
    } else {
      warnings.push({
        source_file: '04_Production_Data.json',
        record_ref: 'FILE',
        severity: 'WARNING',
        code: 'FILE_NOT_FOUND',
        message: `Source file not found at ${prodPath}`,
      });
    }

    return this.ingestRawPayloads(
      { masterCsv, updatesCsv, prodJson },
      trigger,
      warnings
    );
  }

  /**
   * Ingests raw CSV/JSON strings with transparent duplicate, out-of-order, and conflict policies:
   * - Exact duplicate (same ID + same payload hash): skipped idempotently.
   * - Conflicting duplicate (same ID + different payload hash): preserved as explicit conflict warning
   *   and updated only if explicitly newer or flagged without silent overwrite.
   * - Older / out-of-order record (timestamp < existing latest for project): inserted into chronological
   *   history as `historical_backfill` without overwriting latest operational snapshot.
   */
  public ingestRawPayloads(
    payloads: {
      masterCsv?: string;
      updatesCsv?: string;
      prodJson?: string;
    },
    trigger: 'STARTUP' | 'DISK_REFRESH' | 'API_INGEST' = 'API_INGEST',
    initialWarnings: IngestionWarning[] = []
  ): IngestionRunSummary {
    const executedAt = new Date().toISOString();
    const runId = `RUN-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const warnings: IngestionWarning[] = [...initialWarnings];

    let mastersUpserted = 0;
    let updatesInserted = 0;
    let updatesDuplicateSkipped = 0;
    let updatesConflictFlagged = 0;
    let updatesHistoricalBackfill = 0;
    let productionInserted = 0;
    let productionDuplicateSkipped = 0;
    let productionConflictFlagged = 0;
    let productionHistoricalBackfill = 0;

    // 1. Project Master CSV
    if (payloads.masterCsv !== undefined) {
      const parsed = parseProjectMasterCsv(payloads.masterCsv);
      warnings.push(...parsed.warnings);

      const getExistingMaster = this.db.prepare(
        'SELECT payload_hash, last_reported_update_at, reported_actual FROM source_masters WHERE project_id = ?'
      );
      const upsertMaster = this.db.prepare(`
        INSERT INTO source_masters (
          project_id, customer, project_name, project_type, pic,
          start_date, deadline, target, target_unit,
          reported_actual, reported_progress_pct, reported_status,
          last_reported_update_at, payload_hash, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          customer=excluded.customer,
          project_name=excluded.project_name,
          project_type=excluded.project_type,
          pic=excluded.pic,
          start_date=excluded.start_date,
          deadline=excluded.deadline,
          target=excluded.target,
          target_unit=excluded.target_unit,
          reported_actual=excluded.reported_actual,
          reported_progress_pct=excluded.reported_progress_pct,
          reported_status=excluded.reported_status,
          last_reported_update_at=excluded.last_reported_update_at,
          payload_hash=excluded.payload_hash,
          ingested_at=excluded.ingested_at
      `);

      for (const m of parsed.records) {
        const hash = sha256(m);
        const existing = getExistingMaster.get(m.project_id) as
          | { payload_hash: string; last_reported_update_at: string; reported_actual: number }
          | undefined;

        if (existing) {
          if (existing.payload_hash === hash) {
            continue; // Idempotent unchanged master
          }
          const incomingMs = Date.parse(m.last_reported_update_at);
          const existingMs = Date.parse(existing.last_reported_update_at);
          if (incomingMs < existingMs) {
            warnings.push({
              source_file: '02_Project_Master.csv',
              record_ref: m.project_id,
              severity: 'WARNING',
              code: 'OLDER_MASTER_IGNORED',
              message: `Incoming master for ${m.project_id} (${m.last_reported_update_at}) is older than current stored version (${existing.last_reported_update_at}). Kept newer record.`,
            });
            continue;
          }
          if (incomingMs === existingMs && existing.payload_hash !== hash) {
            warnings.push({
              source_file: '02_Project_Master.csv',
              record_ref: m.project_id,
              severity: 'WARNING',
              code: 'CONFLICTING_MASTER_SAME_TIMESTAMP',
              message: `Conflicting master payload for ${m.project_id} at identical timestamp ${m.last_reported_update_at} (prev reported_actual=${existing.reported_actual}, new=${m.reported_actual}). Updated and flagged conflict.`,
            });
          }
        }

        upsertMaster.run(
          m.project_id,
          m.customer,
          m.project_name,
          m.project_type,
          m.pic,
          m.start_date,
          m.deadline,
          m.target,
          m.target_unit,
          m.reported_actual,
          m.reported_progress_pct,
          m.reported_status,
          m.last_reported_update_at,
          hash,
          executedAt
        );
        mastersUpserted++;
      }
    }

    const knownProjectIds = new Set(
      (
        this.db.prepare('SELECT project_id FROM source_masters').all() as Array<{
          project_id: string;
        }>
      ).map((r) => r.project_id)
    );

    // 2. Project Updates CSV
    if (payloads.updatesCsv !== undefined) {
      const parsed = parseProjectUpdatesCsv(payloads.updatesCsv);
      warnings.push(...parsed.warnings);

      const getExistingUpd = this.db.prepare(
        'SELECT payload_hash, timestamp, message FROM source_updates WHERE update_id = ?'
      );
      const getLatestProjectUpd = this.db.prepare(
        'SELECT MAX(timestamp) as max_ts FROM source_updates WHERE project_id = ?'
      );
      const insertUpd = this.db.prepare(`
        INSERT INTO source_updates (
          update_id, project_id, timestamp, source_type, source_name, message, payload_hash, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const u of parsed.records) {
        if (!knownProjectIds.has(u.project_id)) {
          warnings.push({
            source_file: '03_Project_Updates.csv',
            record_ref: u.update_id,
            field: 'project_id',
            severity: 'WARNING',
            code: 'ORPHAN_PROJECT_ID',
            message: `Update ${u.update_id} references unknown project_id "${u.project_id}" not in Project Master. Stored for auditability but excluded from active portfolio until master exists.`,
          });
        }

        const hash = sha256(u);
        const existing = getExistingUpd.get(u.update_id) as
          | { payload_hash: string; timestamp: string; message: string }
          | undefined;

        if (existing) {
          if (existing.payload_hash === hash) {
            updatesDuplicateSkipped++;
            continue;
          }
          // Conflicting duplicate with same update_id! Do NOT silently overwrite original!
          updatesConflictFlagged++;
          warnings.push({
            source_file: '03_Project_Updates.csv',
            record_ref: u.update_id,
            severity: 'WARNING',
            code: 'CONFLICTING_DUPLICATE_UPDATE',
            message: `Conflicting payload for existing update_id ${u.update_id}. Original record preserved; conflicting revision rejected to prevent silent history rewrite.`,
          });
          continue;
        }

        const latestRow = getLatestProjectUpd.get(u.project_id) as { max_ts: string | null };
        if (latestRow?.max_ts && Date.parse(u.timestamp) < Date.parse(latestRow.max_ts)) {
          updatesHistoricalBackfill++;
          if (trigger !== 'STARTUP') {
            warnings.push({
              source_file: '03_Project_Updates.csv',
              record_ref: u.update_id,
              severity: 'INFO',
              code: 'HISTORICAL_BACKFILL_UPDATE',
              message: `Older update ${u.update_id} (${u.timestamp}) inserted chronologically before latest update (${latestRow.max_ts}).`,
            });
          }
        }

        insertUpd.run(
          u.update_id,
          u.project_id,
          u.timestamp,
          u.source_type,
          u.source_name,
          u.message,
          hash,
          executedAt
        );
        updatesInserted++;
      }
    }

    // 3. Production Data JSON
    if (payloads.prodJson !== undefined) {
      const parsed = parseProductionDataJson(payloads.prodJson);
      warnings.push(...parsed.warnings);

      const getExistingProd = this.db.prepare(
        'SELECT payload_hash, timestamp FROM source_production WHERE source_record_id = ?'
      );
      const getLatestProjectProd = this.db.prepare(
        'SELECT MAX(timestamp) as max_ts FROM source_production WHERE project_id = ? AND record_type = ?'
      );
      const insertProd = this.db.prepare(`
        INSERT INTO source_production (
          source_record_id, project_id, source_system, record_type, timestamp, raw_payload_json, payload_hash, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const rec of parsed.records) {
        if (!knownProjectIds.has(rec.project_id)) {
          warnings.push({
            source_file: '04_Production_Data.json',
            record_ref: rec.source_record_id,
            field: 'project_id',
            severity: 'WARNING',
            code: 'ORPHAN_PROJECT_ID',
            message: `Production record ${rec.source_record_id} references unknown project_id "${rec.project_id}".`,
          });
        }

        const hash = sha256(rec.raw_payload);
        const existing = getExistingProd.get(rec.source_record_id) as
          | { payload_hash: string; timestamp: string }
          | undefined;

        if (existing) {
          if (existing.payload_hash === hash) {
            productionDuplicateSkipped++;
            continue;
          }
          productionConflictFlagged++;
          warnings.push({
            source_file: '04_Production_Data.json',
            record_ref: rec.source_record_id,
            severity: 'WARNING',
            code: 'CONFLICTING_DUPLICATE_PRODUCTION',
            message: `Conflicting payload for existing source_record_id ${rec.source_record_id}. Original immutable evidence preserved; conflict flagged.`,
          });
          continue;
        }

        const latestRow = getLatestProjectProd.get(rec.project_id, rec.record_type) as {
          max_ts: string | null;
        };
        if (latestRow?.max_ts && Date.parse(rec.timestamp) < Date.parse(latestRow.max_ts)) {
          productionHistoricalBackfill++;
          if (trigger !== 'STARTUP') {
            warnings.push({
              source_file: '04_Production_Data.json',
              record_ref: rec.source_record_id,
              severity: 'INFO',
              code: 'HISTORICAL_BACKFILL_PRODUCTION',
              message: `Older operational record ${rec.source_record_id} (${rec.timestamp}) archived in history without overwriting newer ${rec.record_type} snapshot (${latestRow.max_ts}).`,
            });
          }
        }

        insertProd.run(
          rec.source_record_id,
          rec.project_id,
          rec.source_system,
          rec.record_type,
          rec.timestamp,
          JSON.stringify(rec.raw_payload),
          hash,
          executedAt
        );
        productionInserted++;
      }
    }

    const quarantinedCount = warnings.filter((w) => w.severity === 'ERROR').length;
    const summary: IngestionRunSummary = {
      run_id: runId,
      trigger,
      executed_at: executedAt,
      masters_upserted: mastersUpserted,
      updates_inserted: updatesInserted,
      updates_duplicate_skipped: updatesDuplicateSkipped,
      updates_conflict_flagged: updatesConflictFlagged,
      updates_historical_backfill: updatesHistoricalBackfill,
      production_inserted: productionInserted,
      production_duplicate_skipped: productionDuplicateSkipped,
      production_conflict_flagged: productionConflictFlagged,
      production_historical_backfill: productionHistoricalBackfill,
      quarantined_count: quarantinedCount,
      warnings,
    };

    this.db
      .prepare(
        'INSERT INTO ingestion_runs (run_id, trigger_type, executed_at, summary_json) VALUES (?, ?, ?, ?)'
      )
      .run(runId, trigger, executedAt, JSON.stringify(summary));

    return summary;
  }

  public getAllMasters(): ProjectMasterRecord[] {
    return this.db
      .prepare(
        `SELECT project_id, customer, project_name, project_type, pic,
                start_date, deadline, target, target_unit,
                reported_actual, reported_progress_pct, reported_status,
                last_reported_update_at
         FROM source_masters
         ORDER BY project_id ASC`
      )
      .all() as unknown as ProjectMasterRecord[];
  }

  public getMasterById(projectId: string): ProjectMasterRecord | null {
    const row = this.db
      .prepare(
        `SELECT project_id, customer, project_name, project_type, pic,
                start_date, deadline, target, target_unit,
                reported_actual, reported_progress_pct, reported_status,
                last_reported_update_at
         FROM source_masters WHERE project_id = ?`
      )
      .get(projectId) as unknown as ProjectMasterRecord | undefined;
    return row ?? null;
  }

  public getUpdatesForProject(projectId: string): ProjectUpdateRecord[] {
    return this.db
      .prepare(
        `SELECT update_id, project_id, timestamp, source_type, source_name, message
         FROM source_updates WHERE project_id = ?
         ORDER BY timestamp ASC`
      )
      .all(projectId) as unknown as ProjectUpdateRecord[];
  }

  public getProductionForProject(projectId: string): ProductionEvidenceRecord[] {
    const rows = this.db
      .prepare(
        `SELECT source_record_id, project_id, source_system, record_type, timestamp, raw_payload_json
         FROM source_production WHERE project_id = ?
         ORDER BY timestamp ASC`
      )
      .all(projectId) as Array<{
      source_record_id: string;
      project_id: string;
      source_system: string;
      record_type: string;
      timestamp: string;
      raw_payload_json: string;
    }>;

    return rows.map((r) => ({
      source_record_id: r.source_record_id,
      project_id: r.project_id,
      source_system: r.source_system,
      record_type: r.record_type,
      timestamp: r.timestamp,
      raw_payload: JSON.parse(r.raw_payload_json) as Record<string, unknown>,
    }));
  }

  public getProductionRecordById(sourceRecordId: string): ProductionEvidenceRecord | null {
    const r = this.db
      .prepare(
        `SELECT source_record_id, project_id, source_system, record_type, timestamp, raw_payload_json
         FROM source_production WHERE source_record_id = ?`
      )
      .get(sourceRecordId) as
      | {
          source_record_id: string;
          project_id: string;
          source_system: string;
          record_type: string;
          timestamp: string;
          raw_payload_json: string;
        }
      | undefined;
    if (!r) return null;
    return {
      source_record_id: r.source_record_id,
      project_id: r.project_id,
      source_system: r.source_system,
      record_type: r.record_type,
      timestamp: r.timestamp,
      raw_payload: JSON.parse(r.raw_payload_json) as Record<string, unknown>,
    };
  }

  public getIngestionRuns(limit = 10): IngestionRunSummary[] {
    const rows = this.db
      .prepare('SELECT summary_json FROM ingestion_runs ORDER BY executed_at DESC LIMIT ?')
      .all(limit) as Array<{ summary_json: string }>;
    return rows.map((r) => JSON.parse(r.summary_json) as IngestionRunSummary);
  }

  /**
   * Direct structured upsert for the Data Management Dashboard (allows interactive
   * editing of Project Master fields and adding new projects with full audit logging).
   */
  public upsertMasterDirect(master: ProjectMasterRecord): IngestionRunSummary {
    const executedAt = new Date().toISOString();
    const runId = `EDIT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const hash = sha256(master);

    this.db
      .prepare(`
        INSERT INTO source_masters (
          project_id, customer, project_name, project_type, pic,
          start_date, deadline, target, target_unit,
          reported_actual, reported_progress_pct, reported_status,
          last_reported_update_at, payload_hash, ingested_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id) DO UPDATE SET
          customer=excluded.customer,
          project_name=excluded.project_name,
          project_type=excluded.project_type,
          pic=excluded.pic,
          start_date=excluded.start_date,
          deadline=excluded.deadline,
          target=excluded.target,
          target_unit=excluded.target_unit,
          reported_actual=excluded.reported_actual,
          reported_progress_pct=excluded.reported_progress_pct,
          reported_status=excluded.reported_status,
          last_reported_update_at=excluded.last_reported_update_at,
          payload_hash=excluded.payload_hash,
          ingested_at=excluded.ingested_at
      `)
      .run(
        master.project_id,
        master.customer,
        master.project_name,
        master.project_type,
        master.pic,
        master.start_date,
        master.deadline,
        master.target,
        master.target_unit,
        master.reported_actual,
        master.reported_progress_pct,
        master.reported_status.toUpperCase(),
        master.last_reported_update_at,
        hash,
        executedAt
      );

    const summary: IngestionRunSummary = {
      run_id: runId,
      trigger: 'API_INGEST',
      executed_at: executedAt,
      masters_upserted: 1,
      updates_inserted: 0,
      updates_duplicate_skipped: 0,
      updates_conflict_flagged: 0,
      updates_historical_backfill: 0,
      production_inserted: 0,
      production_duplicate_skipped: 0,
      production_conflict_flagged: 0,
      production_historical_backfill: 0,
      quarantined_count: 0,
      warnings: [
        {
          source_file: 'DASHBOARD_EDITOR',
          record_ref: master.project_id,
          severity: 'INFO',
          code: 'MASTER_UPDATED_VIA_UI',
          message: `Project Master ${master.project_id} updated via Data Management Dashboard (reported_actual=${master.reported_actual}, deadline=${master.deadline}).`,
        },
      ],
    };

    this.db
      .prepare(
        'INSERT INTO ingestion_runs (run_id, trigger_type, executed_at, summary_json) VALUES (?, ?, ?, ?)'
      )
      .run(runId, 'API_INGEST', executedAt, JSON.stringify(summary));

    return summary;
  }

  /**
   * Resets ingested source tables back to the authoritative CSV/JSON fixtures on disk.
   * Optionally keeps follow-ups intact unless resetFollowUps=true.
   */
  public resetToAuthoritativeData(
    dataDir: string,
    resetFollowUps = false
  ): IngestionRunSummary {
    this.db.exec('DELETE FROM source_masters;');
    this.db.exec('DELETE FROM source_updates;');
    this.db.exec('DELETE FROM source_production;');
    if (resetFollowUps) {
      this.db.exec('DELETE FROM follow_up_history;');
      this.db.exec('DELETE FROM follow_ups;');
    }
    return this.ingestFromDirectory(dataDir, 'DISK_REFRESH');
  }

  /**
   * Resets ONLY the specified project_ids back to their original authoritative values
   * from /data CSV & JSON files (never clears them to empty; preserves all other projects).
   */
  public resetProjectsToAuthoritativeData(
    dataDir: string,
    projectIds: string[],
    resetFollowUps = false
  ): IngestionRunSummary {
    const idSet = new Set(projectIds);
    const masterPath = path.join(dataDir, '02_Project_Master.csv');
    const updatesPath = path.join(dataDir, '03_Project_Updates.csv');
    const prodPath = path.join(dataDir, '04_Production_Data.json');

    const delMaster = this.db.prepare('DELETE FROM source_masters WHERE project_id = ?');
    const delUpdates = this.db.prepare('DELETE FROM source_updates WHERE project_id = ?');
    const delProd = this.db.prepare('DELETE FROM source_production WHERE project_id = ?');
    const delFollowUps = this.db.prepare('DELETE FROM follow_ups WHERE project_id = ?');

    for (const pid of idSet) {
      delMaster.run(pid);
      delUpdates.run(pid);
      delProd.run(pid);
      if (resetFollowUps) {
        delFollowUps.run(pid);
      }
    }

    // Re-ingest only records belonging to idSet from the authoritative fixtures
    let masterCsv: string | undefined;
    let updatesCsv: string | undefined;
    let prodJson: string | undefined;

    if (fs.existsSync(masterPath)) {
      const parsed = parseProjectMasterCsv(fs.readFileSync(masterPath, 'utf-8'));
      const scoped = parsed.records.filter((r) => idSet.has(r.project_id));
      if (scoped.length > 0) {
        const header =
          'project_id,customer,project_name,project_type,pic,start_date,deadline,target,target_unit,reported_actual,reported_progress_pct,reported_status,last_reported_update_at';
        const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
        masterCsv = [
          header,
          ...scoped.map((m) =>
            [
              m.project_id,
              m.customer,
              m.project_name,
              m.project_type,
              m.pic,
              m.start_date,
              m.deadline,
              m.target,
              m.target_unit,
              m.reported_actual,
              m.reported_progress_pct,
              m.reported_status,
              m.last_reported_update_at,
            ]
              .map(esc)
              .join(',')
          ),
        ].join('\n');
      }
    }

    if (fs.existsSync(updatesPath)) {
      const parsed = parseProjectUpdatesCsv(fs.readFileSync(updatesPath, 'utf-8'));
      const scoped = parsed.records.filter((r) => idSet.has(r.project_id));
      if (scoped.length > 0) {
        const header = 'update_id,project_id,timestamp,source_type,source_name,message';
        const esc = (v: unknown) => `"${String(v).replace(/"/g, '""')}"`;
        updatesCsv = [
          header,
          ...scoped.map((u) =>
            [u.update_id, u.project_id, u.timestamp, u.source_type, u.source_name, u.message]
              .map(esc)
              .join(',')
          ),
        ].join('\n');
      }
    }

    if (fs.existsSync(prodPath)) {
      const parsed = parseProductionDataJson(fs.readFileSync(prodPath, 'utf-8'));
      const scoped = parsed.records
        .filter((r) => idSet.has(r.project_id))
        .map((r) => r.raw_payload);
      prodJson = JSON.stringify({ records: scoped });
    }

    return this.ingestRawPayloads({ masterCsv, updatesCsv, prodJson }, 'DISK_REFRESH');
  }

  // =========================================================================
  // FOLLOW-UP WORKFLOW & EVIDENCE-BASED CLOSURE PERSISTENCE
  // =========================================================================
  private hydrateFollowUp(row: Record<string, unknown>): FollowUpRecord {
    const id = String(row.followup_id);
    const history = this.db
      .prepare(
        `SELECT history_id, followup_id, from_status, to_status, verification_status, actor, note, evidence_ref, changed_at
         FROM follow_up_history WHERE followup_id = ?
         ORDER BY history_id DESC`
      )
      .all(id) as unknown as FollowUpHistoryEntry[];

    return {
      followup_id: id,
      project_id: String(row.project_id),
      title: String(row.title),
      description: String(row.description),
      owner: String(row.owner),
      priority: String(row.priority) as 'HIGH' | 'MEDIUM' | 'LOW',
      action_status: String(row.action_status) as FollowUpActionStatus,
      verification_status: String(row.verification_status) as FollowUpVerificationStatus,
      due_date: row.due_date ? String(row.due_date) : null,
      linked_signal_code: row.linked_signal_code ? String(row.linked_signal_code) : null,
      evidence_refs: JSON.parse(String(row.evidence_refs_json || '[]')) as string[],
      verification_evidence_ref: row.verification_evidence_ref
        ? String(row.verification_evidence_ref)
        : null,
      verification_note: row.verification_note ? String(row.verification_note) : null,
      created_at: String(row.created_at),
      updated_at: String(row.updated_at),
      resolved_at: row.resolved_at ? String(row.resolved_at) : null,
      post_resolution_evidence_available: false,
      eligible_verification_records: [],
      history,
    };
  }

  public getFollowUps(projectId?: string): FollowUpRecord[] {
    const rows = projectId
      ? (this.db
          .prepare('SELECT * FROM follow_ups WHERE project_id = ? ORDER BY created_at DESC')
          .all(projectId) as Array<Record<string, unknown>>)
      : (this.db
          .prepare('SELECT * FROM follow_ups ORDER BY created_at DESC')
          .all() as Array<Record<string, unknown>>);

    return rows.map((r) => this.hydrateFollowUp(r));
  }

  public getFollowUpById(followupId: string): FollowUpRecord | null {
    const row = this.db
      .prepare('SELECT * FROM follow_ups WHERE followup_id = ?')
      .get(followupId) as Record<string, unknown> | undefined;
    return row ? this.hydrateFollowUp(row) : null;
  }

  public createFollowUp(input: {
    project_id: string;
    title: string;
    description: string;
    owner: string;
    priority?: 'HIGH' | 'MEDIUM' | 'LOW';
    due_date?: string | null;
    linked_signal_code?: string | null;
    evidence_refs?: string[];
    actor?: string;
    created_at?: string;
  }): FollowUpRecord {
    const now = input.created_at ?? new Date().toISOString();
    const id = `FU-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const priority = input.priority ?? 'MEDIUM';
    const evidenceRefs = input.evidence_refs ?? [];

    this.db
      .prepare(
        `INSERT INTO follow_ups (
          followup_id, project_id, title, description, owner, priority,
          action_status, verification_status, due_date, linked_signal_code,
          evidence_refs_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'OPEN', 'NOT_APPLICABLE', ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        input.project_id,
        input.title,
        input.description,
        input.owner,
        priority,
        input.due_date ?? null,
        input.linked_signal_code ?? null,
        JSON.stringify(evidenceRefs),
        now,
        now
      );

    this.db
      .prepare(
        `INSERT INTO follow_up_history (
          followup_id, from_status, to_status, verification_status, actor, note, evidence_ref, changed_at
        ) VALUES (?, NULL, 'OPEN', 'NOT_APPLICABLE', ?, ?, NULL, ?)`
      )
      .run(
        id,
        input.actor ?? input.owner,
        `Follow-up created and assigned to ${input.owner}.`,
        now
      );

    return this.getFollowUpById(id)!;
  }

  public updateFollowUp(
    followupId: string,
    patch: {
      action_status?: FollowUpActionStatus;
      owner?: string;
      due_date?: string | null;
      priority?: 'HIGH' | 'MEDIUM' | 'LOW';
      title?: string;
      description?: string;
      actor?: string;
      note?: string;
      changed_at?: string;
    }
  ): FollowUpRecord | null {
    const existing = this.getFollowUpById(followupId);
    if (!existing) return null;

    const now = patch.changed_at ?? new Date().toISOString();
    const nextStatus = patch.action_status ?? existing.action_status;
    let nextVerification = existing.verification_status;
    let nextResolvedAt = existing.resolved_at;
    let nextVerificationRef = existing.verification_evidence_ref;
    let nextVerificationNote = existing.verification_note;

    // EVIDENCE-BASED CLOSURE POLICY (Section 11):
    // Marking a follow-up RESOLVED never auto-verifies underlying issue resolution!
    if (nextStatus === 'RESOLVED' && existing.action_status !== 'RESOLVED') {
      nextVerification = 'AWAITING_EVIDENCE';
      nextResolvedAt = now;
      nextVerificationRef = null;
      nextVerificationNote = null;
    } else if (nextStatus === 'OPEN' || nextStatus === 'IN_PROGRESS') {
      nextVerification = 'NOT_APPLICABLE';
      nextResolvedAt = null;
      nextVerificationRef = null;
      nextVerificationNote = null;
    } else if (nextStatus === 'CANCELLED') {
      nextVerification = 'NOT_APPLICABLE';
    }

    this.db
      .prepare(
        `UPDATE follow_ups SET
          title = ?,
          description = ?,
          owner = ?,
          priority = ?,
          action_status = ?,
          verification_status = ?,
          due_date = ?,
          verification_evidence_ref = ?,
          verification_note = ?,
          updated_at = ?,
          resolved_at = ?
        WHERE followup_id = ?`
      )
      .run(
        patch.title ?? existing.title,
        patch.description ?? existing.description,
        patch.owner ?? existing.owner,
        patch.priority ?? existing.priority,
        nextStatus,
        nextVerification,
        patch.due_date !== undefined ? patch.due_date : existing.due_date,
        nextVerificationRef,
        nextVerificationNote,
        now,
        nextResolvedAt,
        followupId
      );

    const statusChanged = nextStatus !== existing.action_status;
    const ownerChanged = patch.owner && patch.owner !== existing.owner;
    const defaultNote = statusChanged
      ? nextStatus === 'RESOLVED'
        ? 'Action marked RESOLVED. Underlying issue remains UNVERIFIED until corroborated by post-resolution operational evidence.'
        : `Status transitioned from ${existing.action_status} to ${nextStatus}.`
      : ownerChanged
        ? `Reassigned owner from ${existing.owner} to ${patch.owner}.`
        : 'Follow-up metadata updated.';

    this.db
      .prepare(
        `INSERT INTO follow_up_history (
          followup_id, from_status, to_status, verification_status, actor, note, evidence_ref, changed_at
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`
      )
      .run(
        followupId,
        existing.action_status,
        nextStatus,
        nextVerification,
        patch.actor ?? patch.owner ?? existing.owner,
        patch.note?.trim() || defaultNote,
        now
      );

    return this.getFollowUpById(followupId);
  }

  /**
   * Verifies a RESOLVED follow-up by linking an operational Production Evidence record
   * whose timestamp is >= the follow-up's resolved_at timestamp (or explicitly corroborated post-action).
   */
  public verifyFollowUpWithEvidence(
    followupId: string,
    input: {
      source_record_id: string;
      note: string;
      actor?: string;
      verified_at?: string;
    }
  ): { record?: FollowUpRecord; error?: string; statusCode?: number } {
    const existing = this.getFollowUpById(followupId);
    if (!existing) return { error: 'Follow-up not found.', statusCode: 404 };

    if (existing.action_status !== 'RESOLVED') {
      return {
        error: 'Follow-up must be in RESOLVED action status before evidence-based verification.',
        statusCode: 400,
      };
    }

    const evidence = this.getProductionRecordById(input.source_record_id);
    if (!evidence) {
      return {
        error: `Operational evidence record "${input.source_record_id}" not found in Production Data.`,
        statusCode: 404,
      };
    }

    if (evidence.project_id !== existing.project_id) {
      return {
        error: `Evidence record "${input.source_record_id}" belongs to ${evidence.project_id}, not ${existing.project_id}.`,
        statusCode: 400,
      };
    }

    if (existing.resolved_at && Date.parse(evidence.timestamp) < Date.parse(existing.resolved_at)) {
      return {
        error: `Evidence record "${input.source_record_id}" timestamp (${evidence.timestamp}) predates action resolution (${existing.resolved_at}). Post-resolution operational evidence is required.`,
        statusCode: 400,
      };
    }

    const now = input.verified_at ?? new Date().toISOString();
    this.db
      .prepare(
        `UPDATE follow_ups SET
          verification_status = 'VERIFIED_BY_EVIDENCE',
          verification_evidence_ref = ?,
          verification_note = ?,
          updated_at = ?
        WHERE followup_id = ?`
      )
      .run(evidence.source_record_id, input.note, now, followupId);

    this.db
      .prepare(
        `INSERT INTO follow_up_history (
          followup_id, from_status, to_status, verification_status, actor, note, evidence_ref, changed_at
        ) VALUES (?, 'RESOLVED', 'RESOLVED', 'VERIFIED_BY_EVIDENCE', ?, ?, ?, ?)`
      )
      .run(
        followupId,
        input.actor ?? 'Management / Reviewer',
        input.note,
        evidence.source_record_id,
        now
      );

    return { record: this.getFollowUpById(followupId)! };
  }
}
