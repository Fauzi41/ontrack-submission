import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { OnTrackDatabase } from '../backend/src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

const MASTER_HEADER =
  'project_id,customer,project_name,project_type,pic,start_date,deadline,target,target_unit,reported_actual,reported_progress_pct,reported_status,last_reported_update_at';

const tempFiles: string[] = [];

afterEach(() => {
  while (tempFiles.length > 0) {
    const p = tempFiles.pop()!;
    for (const s of ['', '-wal', '-shm']) {
      if (fs.existsSync(p + s)) {
        try {
          fs.unlinkSync(p + s);
        } catch {
          // ignore
        }
      }
    }
  }
});

describe('db.ts — SQLite Persistence, Ingestion Policies, Follow-Up Audit & Reset (18 tests)', () => {
  it('1. ingests all 6 masters, 23 updates, and 12 production records cleanly on startup', () => {
    const db = new OnTrackDatabase(':memory:');
    const run = db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    expect(run.masters_upserted).toBe(6);
    expect(run.updates_inserted).toBe(23);
    expect(run.production_inserted).toBe(12);
    expect(run.quarantined_count).toBe(0);
    db.close();
  });

  it('2. skips exact duplicate updates and production records idempotently on disk refresh', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const second = db.ingestFromDirectory(DATA_DIR, 'DISK_REFRESH');
    expect(second.masters_upserted).toBe(0);
    expect(second.updates_inserted).toBe(0);
    expect(second.updates_duplicate_skipped).toBe(23);
    expect(second.production_inserted).toBe(0);
    expect(second.production_duplicate_skipped).toBe(12);
    db.close();
  });

  it('3. ignores older master CSV record and logs OLDER_MASTER_IGNORED warning', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const res = db.ingestRawPayloads({
      masterCsv: `${MASTER_HEADER}\nPRJ-001,Instansi Alpha,Penataan Arsip Inaktif Alpha,Archive Arrangement,Raka,2026-09-01,2026-10-15,400,ML,100,25,ON TRACK,2026-10-01T10:00:00`,
    });
    expect(res.masters_upserted).toBe(0);
    expect(res.warnings.some((w) => w.code === 'OLDER_MASTER_IGNORED')).toBe(true);
    expect(db.getMasterById('PRJ-001')?.reported_actual).toBe(318);
    db.close();
  });

  it('4. flags CONFLICTING_MASTER_SAME_TIMESTAMP when master changes at identical timestamp', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const res = db.ingestRawPayloads({
      masterCsv: `${MASTER_HEADER}\nPRJ-001,Instansi Alpha,Penataan Arsip Inaktif Alpha,Archive Arrangement,Raka,2026-09-01,2026-10-15,400,ML,330,82.5,ON TRACK,2026-10-06T11:32:00`,
    });
    expect(res.masters_upserted).toBe(1);
    expect(res.warnings.some((w) => w.code === 'CONFLICTING_MASTER_SAME_TIMESTAMP')).toBe(true);
    db.close();
  });

  it('5. flags conflicting duplicate update ID and preserves original message', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const res = db.ingestRawPayloads({
      updatesCsv:
        'update_id,project_id,timestamp,source_type,source_name,message\nUPD-001,PRJ-006,2026-09-29T14:00:00,TECHNICAL_TEAM,Tim Teknis,Tampered text',
    });
    expect(res.updates_conflict_flagged).toBe(1);
    const orig = db.getUpdatesForProject('PRJ-006').find((u) => u.update_id === 'UPD-001');
    expect(orig?.message).not.toBe('Tampered text');
    db.close();
  });

  it('6. flags conflicting duplicate production ID and preserves original immutable snapshot', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const res = db.ingestRawPayloads({
      prodJson: JSON.stringify({
        records: [
          {
            source_record_id: 'SCAN-BETA-001',
            project_id: 'PRJ-002',
            source_system: 'scanner_production_log',
            record_type: 'production_snapshot',
            timestamp: '2026-10-05T23:59:00',
            pages_processed_total: 120000,
            unit: 'pages',
          },
        ],
      }),
    });
    expect(res.production_conflict_flagged).toBe(1);
    expect(db.getProductionRecordById('SCAN-BETA-001')?.raw_payload.pages_processed_total).toBe(87240);
    db.close();
  });

  it('7. records historical backfill warning when inserting older out-of-order update or production record', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const res = db.ingestRawPayloads({
      updatesCsv:
        'update_id,project_id,timestamp,source_type,source_name,message\nUPD-HIST-1,PRJ-001,2026-09-15T10:00:00,OPERATOR,Op,Backfill update',
      prodJson: JSON.stringify({
        records: [
          {
            source_record_id: 'PROD-HIST-1',
            project_id: 'PRJ-002',
            source_system: 'scanner_production_log',
            record_type: 'production_snapshot',
            timestamp: '2026-09-25T23:59:00',
            pages_processed_total: 50000,
            unit: 'pages',
          },
        ],
      }),
    });
    expect(res.updates_historical_backfill).toBe(1);
    expect(res.production_historical_backfill).toBe(1);
    db.close();
  });

  it('8. flags ORPHAN_PROJECT_ID warning for updates/production referencing unknown project', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const res = db.ingestRawPayloads({
      updatesCsv:
        'update_id,project_id,timestamp,source_type,source_name,message\nUPD-ORPHAN,PRJ-GHOST,2026-10-06T10:00:00,OPERATOR,Op,Ghost update',
    });
    expect(res.warnings.some((w) => w.code === 'ORPHAN_PROJECT_ID')).toBe(true);
    db.close();
  });

  it('9. records warnings when source directory files are missing without crashing', () => {
    const db = new OnTrackDatabase(':memory:');
    const res = db.ingestFromDirectory(path.join(os.tmpdir(), 'nonexistent-ontrack-dir-xyz'), 'DISK_REFRESH');
    expect(res.warnings.some((w) => w.code === 'FILE_NOT_FOUND')).toBe(true);
    expect(db.getAllMasters()).toHaveLength(0);
    db.close();
  });

  it('10. upsertMasterDirect updates existing project master and logs ingestion run', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const m = db.getMasterById('PRJ-001')!;
    const run = db.upsertMasterDirect({ ...m, reported_actual: 350, reported_progress_pct: 87.5 });
    expect(run.masters_upserted).toBe(1);
    expect(db.getMasterById('PRJ-001')?.reported_actual).toBe(350);
    expect(db.getIngestionRuns(5).length).toBeGreaterThanOrEqual(2);
    db.close();
  });

  it('11. resetToAuthoritativeData restores all 6 projects while preserving follow-ups when resetFollowUps=false', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    db.createFollowUp({
      project_id: 'PRJ-002',
      title: 'Check scanner',
      description: 'Verify SCN-B speed',
      owner: 'Nadia',
    });
    db.upsertMasterDirect({ ...db.getMasterById('PRJ-002')!, reported_actual: 115000 });
    db.resetToAuthoritativeData(DATA_DIR, false);
    expect(db.getMasterById('PRJ-002')?.reported_actual).toBe(91500);
    expect(db.getFollowUps('PRJ-002')).toHaveLength(1);
    db.close();
  });

  it('12. resetToAuthoritativeData clears follow-ups when resetFollowUps=true', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    db.createFollowUp({
      project_id: 'PRJ-002',
      title: 'Check scanner',
      description: 'Verify SCN-B speed',
      owner: 'Nadia',
    });
    db.resetToAuthoritativeData(DATA_DIR, true);
    expect(db.getFollowUps()).toHaveLength(0);
    expect(db.getAllMasters()).toHaveLength(6);
    db.close();
  });

  it('13. resetProjectsToAuthoritativeData restores only target project without touching other projects', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    db.upsertMasterDirect({ ...db.getMasterById('PRJ-005')!, reported_actual: 10 });
    db.upsertMasterDirect({ ...db.getMasterById('PRJ-001')!, reported_actual: 399 });
    db.resetProjectsToAuthoritativeData(DATA_DIR, ['PRJ-005'], false);
    expect(db.getMasterById('PRJ-005')?.reported_actual).toBe(9);
    expect(db.getMasterById('PRJ-001')?.reported_actual).toBe(399);
    db.close();
  });

  it('14. creates follow-up with initial OPEN audit history entry', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const fu = db.createFollowUp({
      project_id: 'PRJ-005',
      title: 'Request creds',
      description: 'Contact customer',
      owner: 'Kevin',
      priority: 'HIGH',
      due_date: '2026-10-08',
      evidence_refs: ['API-EPS-002'],
    });
    expect(fu.action_status).toBe('OPEN');
    expect(fu.verification_status).toBe('NOT_APPLICABLE');
    expect(fu.evidence_refs).toEqual(['API-EPS-002']);
    expect(fu.history).toHaveLength(1);
    db.close();
  });

  it('15. transitions follow-up OPEN -> IN_PROGRESS -> RESOLVED (AWAITING_EVIDENCE) -> OPEN (reset verification)', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const fu = db.createFollowUp({
      project_id: 'PRJ-005',
      title: 'Request creds',
      description: 'Contact customer',
      owner: 'Kevin',
    });
    const inProg = db.updateFollowUp(fu.followup_id, { action_status: 'IN_PROGRESS', actor: 'Kevin' })!;
    expect(inProg.action_status).toBe('IN_PROGRESS');
    const resolved = db.updateFollowUp(fu.followup_id, {
      action_status: 'RESOLVED',
      actor: 'Kevin',
      changed_at: '2026-10-06T18:00:00',
    })!;
    expect(resolved.verification_status).toBe('AWAITING_EVIDENCE');
    expect(resolved.resolved_at).toBe('2026-10-06T18:00:00');
    const reopened = db.updateFollowUp(fu.followup_id, { action_status: 'OPEN', actor: 'Director' })!;
    expect(reopened.verification_status).toBe('NOT_APPLICABLE');
    expect(reopened.resolved_at).toBeNull();
    expect(reopened.history).toHaveLength(4);
    db.close();
  });

  it('16. persists follow-ups and history durably across SQLite file close and reopen', () => {
    const tmpPath = path.join(os.tmpdir(), `ontrack-db-persist-${Date.now()}.sqlite`);
    tempFiles.push(tmpPath);

    const db1 = new OnTrackDatabase(tmpPath);
    db1.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const created = db1.createFollowUp({
      project_id: 'PRJ-004',
      title: 'Audit 52% formula',
      description: 'Verify why reported_progress_pct is 52 instead of 45',
      owner: 'Sari',
    });
    db1.close();

    const db2 = new OnTrackDatabase(tmpPath);
    const loaded = db2.getFollowUpById(created.followup_id);
    expect(loaded).not.toBeNull();
    expect(loaded?.title).toBe('Audit 52% formula');
    expect(loaded?.history).toHaveLength(1);
    db2.close();
  });

  it('17. verifyFollowUpWithEvidence rejects non-RESOLVED, unknown evidence, wrong project, and pre-resolution evidence', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const fu = db.createFollowUp({
      project_id: 'PRJ-005',
      title: 'Creds',
      description: 'Desc',
      owner: 'Kevin',
    });
    // Non-resolved
    expect(
      db.verifyFollowUpWithEvidence(fu.followup_id, { source_record_id: 'API-EPS-002', note: 'n' })
        .statusCode
    ).toBe(400);

    db.updateFollowUp(fu.followup_id, {
      action_status: 'RESOLVED',
      changed_at: '2026-10-06T18:00:00',
    });

    // Missing evidence
    expect(
      db.verifyFollowUpWithEvidence(fu.followup_id, { source_record_id: 'NO-SUCH-REC', note: 'n' })
        .statusCode
    ).toBe(404);

    // Wrong project evidence
    expect(
      db.verifyFollowUpWithEvidence(fu.followup_id, { source_record_id: 'DMS-ZETA-002', note: 'n' })
        .statusCode
    ).toBe(400);

    // Pre-resolution timestamp (07:32 < 18:00)
    expect(
      db.verifyFollowUpWithEvidence(fu.followup_id, { source_record_id: 'API-EPS-002', note: 'n' })
        .statusCode
    ).toBe(400);

    db.close();
  });

  it('18. verifyFollowUpWithEvidence marks VERIFIED_BY_EVIDENCE with valid post-resolution operational record', () => {
    const db = new OnTrackDatabase(':memory:');
    db.ingestFromDirectory(DATA_DIR, 'STARTUP');
    const fu = db.createFollowUp({
      project_id: 'PRJ-005',
      title: 'Creds',
      description: 'Desc',
      owner: 'Kevin',
    });
    db.updateFollowUp(fu.followup_id, {
      action_status: 'RESOLVED',
      changed_at: '2026-10-06T18:00:00',
    });
    db.ingestRawPayloads({
      prodJson: JSON.stringify({
        records: [
          {
            source_record_id: 'API-EPS-POST-1',
            project_id: 'PRJ-005',
            source_system: 'api_monitor',
            record_type: 'environment_check',
            timestamp: '2026-10-07T09:00:00',
            environment: 'production',
            connection_status: 'CONNECTED',
            last_successful_connection: '2026-10-07T08:55:00',
          },
        ],
      }),
    });

    const verified = db.verifyFollowUpWithEvidence(fu.followup_id, {
      source_record_id: 'API-EPS-POST-1',
      note: 'Verified CONNECTED in production',
      actor: 'Director',
    });
    expect(verified.error).toBeUndefined();
    expect(verified.record?.verification_status).toBe('VERIFIED_BY_EVIDENCE');
    expect(verified.record?.verification_evidence_ref).toBe('API-EPS-POST-1');
    expect(verified.record?.history).toHaveLength(3);
    db.close();
  });
});
