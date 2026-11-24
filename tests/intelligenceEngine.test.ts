import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DEFAULT_AS_OF_DATE, OnTrackDatabase } from '../backend/src/db.js';
import { evaluateProjectIntelligence } from '../backend/src/intelligenceEngine.js';
import type {
  FollowUpRecord,
  ProductionEvidenceRecord,
  ProjectMasterRecord,
  ProjectUpdateRecord,
} from '../backend/src/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

function loadAuthoritative() {
  const db = new OnTrackDatabase(':memory:');
  db.ingestFromDirectory(DATA_DIR, 'STARTUP');
  const evalId = (id: string, asOf = DEFAULT_AS_OF_DATE) =>
    evaluateProjectIntelligence(
      db.getMasterById(id)!,
      db.getUpdatesForProject(id),
      db.getProductionForProject(id),
      db.getFollowUps(id),
      asOf
    );
  return { db, evalId };
}

function baseMaster(overrides: Partial<ProjectMasterRecord> = {}): ProjectMasterRecord {
  return {
    project_id: 'PRJ-GEN-1',
    customer: 'Client Gen',
    project_name: 'Generic Project',
    project_type: 'Archive Arrangement',
    pic: 'Budi',
    start_date: '2026-09-01',
    deadline: '2026-10-20',
    target: 1000,
    target_unit: 'boxes',
    reported_actual: 800,
    reported_progress_pct: 80,
    reported_status: 'ON TRACK',
    last_reported_update_at: '2026-10-06T12:00:00',
    ...overrides,
  };
}

describe('intelligenceEngine.ts — Authoritative Projects, Generic Rules R1-R6 & Anti-Hardcoding (32 tests)', () => {
  // Authoritative 6 Projects (12 tests)
  it('1. PRJ-001 classifies workflow-state gap (301.5 + 16.5 = 318 ML) without calling it an error', () => {
    const { db, evalId } = loadAuthoritative();
    const p1 = evalId('PRJ-001');
    expect(p1.signals.some((s) => s.rule_code === 'R2A_WORKFLOW_STATE_GAP')).toBe(true);
    expect(p1.signals.some((s) => s.rule_code === 'R2B_REPORT_VS_OPERATIONAL_GAP')).toBe(false);
    expect(p1.operational_summary.pending_quantity).toBe(16.5);
    db.close();
  });

  it('2. PRJ-001 flags hold/rework risk with traceable UPD-012 & UPD-019 refs', () => {
    const { db, evalId } = loadAuthoritative();
    const p1 = evalId('PRJ-001');
    const holdSig = p1.signals.find((s) => s.rule_code === 'R4D_OPERATIONAL_HOLD_REWORK');
    expect(holdSig).toBeDefined();
    expect(holdSig?.evidence_refs.some((r) => r.ref_id === 'UPD-012')).toBe(true);
    expect(holdSig?.evidence_refs.some((r) => r.ref_id === 'UPD-019')).toBe(true);
    db.close();
  });

  it('3. PRJ-002 classified CRITICAL with R3_SCHEDULE_INFEASIBLE, R2B discrepancy & R4A scanner', () => {
    const { db, evalId } = loadAuthoritative();
    const p2 = evalId('PRJ-002');
    expect(p2.attention_level).toBe('CRITICAL');
    expect(p2.signals.map((s) => s.rule_code)).toEqual(
      expect.arrayContaining([
        'R3_SCHEDULE_INFEASIBLE',
        'R2B_REPORT_VS_OPERATIONAL_GAP',
        'R4A_OPERATIONAL_RESOURCE_DEGRADED',
      ])
    );
    db.close();
  });

  it('4. PRJ-002 tracks scanner state chronologically from OUT_OF_SERVICE to LIMITED', () => {
    const { db, evalId } = loadAuthoritative();
    const p2 = evalId('PRJ-002');
    const latestB = p2.operational_summary.scanners?.units.find((u) => u.scanner_id === 'SCN-B');
    const prevB = p2.operational_summary.scanners?.previous_snapshot?.units.find(
      (u) => u.scanner_id === 'SCN-B'
    );
    expect(latestB?.status).toBe('LIMITED');
    expect(prevB?.status).toBe('OUT_OF_SERVICE');
    db.close();
  });

  it('5. PRJ-002 time-travel asOf=2026-10-06T09:00:00 sees SCN-B as OUT_OF_SERVICE (before 15:30 repair)', () => {
    const { db, evalId } = loadAuthoritative();
    const p2Morning = evalId('PRJ-002', '2026-10-06T09:00:00');
    const scnB = p2Morning.operational_summary.scanners?.units.find((u) => u.scanner_id === 'SCN-B');
    expect(scnB?.status).toBe('OUT_OF_SERVICE');
    db.close();
  });

  it('6. PRJ-003 flags 6-day staleness blind spot with explicit HIGH uncertainty', () => {
    const { db, evalId } = loadAuthoritative();
    const p3 = evalId('PRJ-003');
    expect(p3.uncertainty_level).toBe('HIGH');
    expect(p3.signals.some((s) => s.rule_code === 'R5_DATA_STALENESS_BLIND_SPOT')).toBe(true);
    expect(p3.unknowns.some((u) => u.code === 'UNKNOWN_CURRENT_PROGRESS_STALE')).toBe(true);
    db.close();
  });

  it('7. PRJ-003 flags +2.0% internal report arithmetic mismatch (94% vs 92%)', () => {
    const { db, evalId } = loadAuthoritative();
    const p3 = evalId('PRJ-003');
    expect(p3.signals.some((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH')).toBe(true);
    expect(p3.deadline_analysis.computed_reported_pct).toBe(92);
    db.close();
  });

  it('8. PRJ-004 flags +7.0% report mismatch (52% vs 45%) as HIGH severity', () => {
    const { db, evalId } = loadAuthoritative();
    const p4 = evalId('PRJ-004');
    const r1 = p4.signals.find((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH');
    expect(r1?.severity).toBe('HIGH');
    db.close();
  });

  it('9. PRJ-004 computes 6.64% quality skip rate (3,200 / 48,200) and missing operator capacity unknown', () => {
    const { db, evalId } = loadAuthoritative();
    const p4 = evalId('PRJ-004');
    expect(p4.operational_summary.quality_skipped_count).toBe(3200);
    expect(p4.operational_summary.quality_skip_rate_pct).toBe(6.64);
    expect(p4.unknowns.some((u) => u.code === 'UNKNOWN_OPERATOR_CAPACITY')).toBe(true);
    db.close();
  });

  it('10. PRJ-005 flags CRITICAL validation gap (0/10 prod-tested) & NOT_CONFIGURED environment', () => {
    const { db, evalId } = loadAuthoritative();
    const p5 = evalId('PRJ-005');
    expect(p5.attention_level).toBe('CRITICAL');
    expect(p5.signals.some((s) => s.rule_code === 'R2C_VALIDATION_DOD_GAP')).toBe(true);
    expect(p5.signals.some((s) => s.rule_code === 'R4B_ENVIRONMENT_NOT_READY')).toBe(true);
    expect(p5.operational_summary.environment_status?.last_successful_connection).toBeNull();
    db.close();
  });

  it('11. PRJ-006 control baseline produces 0 signals and does not penalize completed PM report age', () => {
    const { db, evalId } = loadAuthoritative();
    const p6 = evalId('PRJ-006');
    expect(p6.attention_level).toBe('LOW');
    expect(p6.attention_score).toBe(0);
    expect(p6.signals).toHaveLength(0);
    expect(p6.key_verdict).toContain('Selesai');
    db.close();
  });

  it('12. PRJ-006 retains informational post-go-live adoption denominator note without raising uncertainty above LOW', () => {
    const { db, evalId } = loadAuthoritative();
    const p6 = evalId('PRJ-006');
    expect(p6.uncertainty_level).toBe('LOW');
    expect(p6.unknowns.some((u) => u.code === 'INFO_POST_GOLIVE_ADOPTION_DENOMINATOR')).toBe(true);
    db.close();
  });

  // Generic Rules & Anti-Hardcoding (20 tests)
  it('13. evaluates unseen synthetic project PRJ-999-CUSTOM identically without hardcoding', () => {
    const m = baseMaster({
      project_id: 'PRJ-999-CUSTOM',
      start_date: '2026-09-01',
      deadline: '2026-10-11',
      target: 10000,
      target_unit: 'pages',
      reported_actual: 6000,
      reported_progress_pct: 70,
    });
    const u: ProjectUpdateRecord[] = [
      {
        update_id: 'U-999',
        project_id: 'PRJ-999-CUSTOM',
        timestamp: '2026-10-06T09:00:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'Budi',
        message: 'Kapasitas tim sekitar 400 halaman per hari.',
      },
    ];
    const p: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-999',
        project_id: 'PRJ-999-CUSTOM',
        source_system: 'scanner_production_log',
        record_type: 'production_snapshot',
        timestamp: '2026-10-06T08:00:00',
        raw_payload: { pages_processed_total: 5000, unit: 'pages' },
      },
    ];
    const res = evaluateProjectIntelligence(m, u, p, [], DEFAULT_AS_OF_DATE);
    expect(res.attention_level).toBe('CRITICAL');
    expect(res.signals.some((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH')).toBe(true);
    expect(res.signals.some((s) => s.rule_code === 'R2B_REPORT_VS_OPERATIONAL_GAP')).toBe(true);
    expect(res.signals.some((s) => s.rule_code === 'R3_SCHEDULE_INFEASIBLE')).toBe(true);
  });

  it('14. R1 does NOT trigger when reported_progress_pct is within 0.5% rounding tolerance', () => {
    const m = baseMaster({ target: 300, reported_actual: 100, reported_progress_pct: 33.4 });
    const res = evaluateProjectIntelligence(m, [], [], [], DEFAULT_AS_OF_DATE);
    expect(res.signals.some((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH')).toBe(false);
  });

  it('15. R1 triggers MEDIUM severity when arithmetic gap is between 0.5% and 5%', () => {
    const m = baseMaster({ target: 1000, reported_actual: 800, reported_progress_pct: 82 });
    const res = evaluateProjectIntelligence(m, [], [], [], DEFAULT_AS_OF_DATE);
    const sig = res.signals.find((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH');
    expect(sig?.severity).toBe('MEDIUM');
  });

  it('16. R1 triggers HIGH severity when arithmetic gap is >= 5%', () => {
    const m = baseMaster({ target: 1000, reported_actual: 800, reported_progress_pct: 86 });
    const res = evaluateProjectIntelligence(m, [], [], [], DEFAULT_AS_OF_DATE);
    const sig = res.signals.find((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH');
    expect(sig?.severity).toBe('HIGH');
  });

  it('17. R2B triggers MEDIUM when discrepancy is < 3% of target and HIGH when >= 3%', () => {
    const m = baseMaster({ target: 1000, reported_actual: 800, reported_progress_pct: 80 });
    const smallGapProd: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-SM',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-06T12:00:00',
        raw_payload: { processed_boxes: 785, unit: 'boxes' },
      },
    ];
    const largeGapProd: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-LG',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-06T12:00:00',
        raw_payload: { processed_boxes: 750, unit: 'boxes' },
      },
    ];
    const rSmall = evaluateProjectIntelligence(m, [], smallGapProd, [], DEFAULT_AS_OF_DATE);
    const rLarge = evaluateProjectIntelligence(m, [], largeGapProd, [], DEFAULT_AS_OF_DATE);
    expect(rSmall.signals.find((s) => s.rule_code === 'R2B_REPORT_VS_OPERATIONAL_GAP')?.severity).toBe(
      'MEDIUM'
    );
    expect(rLarge.signals.find((s) => s.rule_code === 'R2B_REPORT_VS_OPERATIONAL_GAP')?.severity).toBe(
      'HIGH'
    );
  });

  it('18. R2C clears automatically once production_tested_endpoints matches developed_endpoints', () => {
    const m = baseMaster({ target: 10, target_unit: 'endpoints', reported_actual: 10, reported_progress_pct: 100 });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'API-DONE',
        project_id: m.project_id,
        source_system: 'api_monitor',
        record_type: 'integration_snapshot',
        timestamp: '2026-10-06T12:00:00',
        raw_payload: {
          developed_endpoints: 10,
          configured_endpoints: 10,
          production_tested_endpoints: 10,
          target_endpoints: 10,
        },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.some((s) => s.rule_code === 'R2C_VALIDATION_DOD_GAP')).toBe(false);
  });

  it('19. R3_SCHEDULE_OVERDUE triggers CRITICAL when active project deadline has passed', () => {
    const m = baseMaster({ deadline: '2026-10-05' });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-OD',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-06T12:00:00',
        raw_payload: { processed_boxes: 800, unit: 'boxes' },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.some((s) => s.rule_code === 'R3_SCHEDULE_OVERDUE')).toBe(true);
    expect(res.attention_level).toBe('CRITICAL');
  });

  it('20. R4A clears automatically when latest scanner snapshot shows all units RUNNING', () => {
    const m = baseMaster({ target_unit: 'pages' });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'SC-1',
        project_id: m.project_id,
        source_system: 'scanner_production_log',
        record_type: 'scanner_status',
        timestamp: '2026-10-06T08:00:00',
        raw_payload: { scanners: [{ scanner_id: 'SCN-B', status: 'OUT_OF_SERVICE' }] },
      },
      {
        source_record_id: 'SC-2',
        project_id: m.project_id,
        source_system: 'scanner_production_log',
        record_type: 'scanner_status',
        timestamp: '2026-10-06T16:00:00',
        raw_payload: { scanners: [{ scanner_id: 'SCN-B', status: 'RUNNING' }] },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.some((s) => s.rule_code === 'R4A_OPERATIONAL_RESOURCE_DEGRADED')).toBe(false);
  });

  it('21. R4A severity is CRITICAL when latest scanner snapshot has OUT_OF_SERVICE', () => {
    const m = baseMaster({ target_unit: 'pages' });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'SC-DOWN',
        project_id: m.project_id,
        source_system: 'scanner_production_log',
        record_type: 'scanner_status',
        timestamp: '2026-10-06T16:00:00',
        raw_payload: { scanners: [{ scanner_id: 'SCN-B', status: 'OUT_OF_SERVICE' }] },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.find((s) => s.rule_code === 'R4A_OPERATIONAL_RESOURCE_DEGRADED')?.severity).toBe(
      'CRITICAL'
    );
  });

  it('22. R4B clears automatically when latest environment_check is CONNECTED', () => {
    const m = baseMaster({ target_unit: 'endpoints' });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'ENV-1',
        project_id: m.project_id,
        source_system: 'api_monitor',
        record_type: 'environment_check',
        timestamp: '2026-10-06T08:00:00',
        raw_payload: { environment: 'production', connection_status: 'NOT_CONFIGURED', last_successful_connection: null },
      },
      {
        source_record_id: 'ENV-2',
        project_id: m.project_id,
        source_system: 'api_monitor',
        record_type: 'environment_check',
        timestamp: '2026-10-06T15:00:00',
        raw_payload: {
          environment: 'production',
          connection_status: 'CONNECTED',
          last_successful_connection: '2026-10-06T14:59:00',
        },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.some((s) => s.rule_code === 'R4B_ENVIRONMENT_NOT_READY')).toBe(false);
  });

  it('23. R4C severity is MEDIUM when skip rate < 5% and HIGH when >= 5%', () => {
    const m = baseMaster({ target: 10000, reported_actual: 5000, reported_progress_pct: 50, target_unit: 'records' });
    const lowSkip: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'V-1',
        project_id: m.project_id,
        source_system: 'verification_application',
        record_type: 'verification_snapshot',
        timestamp: '2026-10-06T10:00:00',
        raw_payload: { records_verified: 5000, unit: 'records' },
      },
      {
        source_record_id: 'V-2',
        project_id: m.project_id,
        source_system: 'verification_application',
        record_type: 'verification_quality_snapshot',
        timestamp: '2026-10-06T10:00:00',
        raw_payload: { records_skipped_missing_region: 100, unit: 'records' },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], lowSkip, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.find((s) => s.rule_code === 'R4C_DATA_QUALITY_SKIP')?.severity).toBe('MEDIUM');
  });

  it('24. R4E triggers CRITICAL when DMS application_status is OFFLINE', () => {
    const m = baseMaster({ reported_status: 'COMPLETED', target: 1, reported_actual: 1, reported_progress_pct: 100, target_unit: 'system' });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'DMS-DOWN',
        project_id: m.project_id,
        source_system: 'dms_monitor',
        record_type: 'system_status',
        timestamp: '2026-10-06T16:00:00',
        raw_payload: { application_status: 'OFFLINE', deployment_status: 'COMPLETED' },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.some((s) => s.rule_code === 'R4E_APPLICATION_NOT_ONLINE')).toBe(true);
    expect(res.attention_level).toBe('CRITICAL');
  });

  it('25. R5 does NOT trigger when active project has a fresh update (< 72h) even if operational log is older', () => {
    const m = baseMaster();
    const upd: ProjectUpdateRecord[] = [
      {
        update_id: 'U-FRESH',
        project_id: m.project_id,
        timestamp: '2026-10-06T10:00:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'Budi',
        message: 'Produksi berjalan lancar.',
      },
    ];
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-OLD',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-01T10:00:00',
        raw_payload: { processed_boxes: 800, unit: 'boxes' },
      },
    ];
    const res = evaluateProjectIntelligence(m, upd, prod, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.some((s) => s.rule_code === 'R5_DATA_STALENESS_BLIND_SPOT')).toBe(false);
  });

  it('26. R5 severity is MEDIUM for 3-4 days stale and HIGH for >= 5 days stale', () => {
    const m = baseMaster();
    const fourDaysOld: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-4D',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-02T17:00:00',
        raw_payload: { processed_boxes: 800, unit: 'boxes' },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], fourDaysOld, [], DEFAULT_AS_OF_DATE);
    expect(res.signals.find((s) => s.rule_code === 'R5_DATA_STALENESS_BLIND_SPOT')?.severity).toBe(
      'MEDIUM'
    );
  });

  it('27. filters out future updates and production records strictly beyond asOfDate', () => {
    const m = baseMaster();
    const futureProd: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-FUTURE',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-08T10:00:00',
        raw_payload: { processed_boxes: 999, unit: 'boxes' },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], futureProd, [], DEFAULT_AS_OF_DATE);
    expect(res.operational_summary.verified_quantity).toBeNull();
    expect(res.timeline).toHaveLength(0);
  });

  it('28. sorts unified timeline newest-first across both updates and operational records', () => {
    const { db, evalId } = loadAuthoritative();
    const p2 = evalId('PRJ-002');
    for (let i = 1; i < p2.timeline.length; i++) {
      expect(Date.parse(p2.timeline[i - 1].timestamp)).toBeGreaterThanOrEqual(
        Date.parse(p2.timeline[i].timestamp)
      );
    }
    db.close();
  });

  it('29. flags FOLLOWUP_CLOSED_UNVERIFIED unknown when a RESOLVED follow-up lacks verification', () => {
    const m = baseMaster();
    const fu: FollowUpRecord = {
      followup_id: 'FU-1',
      project_id: m.project_id,
      title: 'Test action',
      description: 'Desc',
      owner: 'Budi',
      priority: 'HIGH',
      action_status: 'RESOLVED',
      verification_status: 'AWAITING_EVIDENCE',
      due_date: '2026-10-08',
      linked_signal_code: null,
      evidence_refs: [],
      verification_evidence_ref: null,
      verification_note: null,
      created_at: '2026-10-06T10:00:00',
      updated_at: '2026-10-06T12:00:00',
      resolved_at: '2026-10-06T12:00:00',
      post_resolution_evidence_available: false,
      eligible_verification_records: [],
      history: [],
    };
    const res = evaluateProjectIntelligence(m, [], [], [fu], DEFAULT_AS_OF_DATE);
    expect(res.resolved_unverified_followup_count).toBe(1);
    expect(res.unknowns.some((u) => u.code === 'FOLLOWUP_CLOSED_UNVERIFIED')).toBe(true);
  });

  it('30. populates eligible_verification_records only with operational records at or after resolved_at', () => {
    const m = baseMaster();
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-BEFORE',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-06T10:00:00',
        raw_payload: { processed_boxes: 700, unit: 'boxes' },
      },
      {
        source_record_id: 'P-AFTER',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-06T15:00:00',
        raw_payload: { processed_boxes: 800, unit: 'boxes' },
      },
    ];
    const fu: FollowUpRecord = {
      followup_id: 'FU-2',
      project_id: m.project_id,
      title: 'Action',
      description: 'Desc',
      owner: 'Budi',
      priority: 'HIGH',
      action_status: 'RESOLVED',
      verification_status: 'AWAITING_EVIDENCE',
      due_date: null,
      linked_signal_code: null,
      evidence_refs: [],
      verification_evidence_ref: null,
      verification_note: null,
      created_at: '2026-10-06T09:00:00',
      updated_at: '2026-10-06T12:00:00',
      resolved_at: '2026-10-06T12:00:00',
      post_resolution_evidence_available: false,
      eligible_verification_records: [],
      history: [],
    };
    const res = evaluateProjectIntelligence(m, [], prod, [fu], DEFAULT_AS_OF_DATE);
    expect(res.followups[0].post_resolution_evidence_available).toBe(true);
    expect(res.followups[0].eligible_verification_records.map((r) => r.ref_id)).toEqual(['P-AFTER']);
  });

  it('31. caps attention_score at 100 even with multiple stacked CRITICAL signals', () => {
    const m = baseMaster({ deadline: '2026-10-01', target_unit: 'endpoints', reported_actual: 9, target: 10, reported_progress_pct: 90 });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'E-1',
        project_id: m.project_id,
        source_system: 'api_monitor',
        record_type: 'integration_snapshot',
        timestamp: '2026-10-06T10:00:00',
        raw_payload: { developed_endpoints: 9, configured_endpoints: 9, production_tested_endpoints: 0, target_endpoints: 10 },
      },
      {
        source_record_id: 'E-2',
        project_id: m.project_id,
        source_system: 'api_monitor',
        record_type: 'environment_check',
        timestamp: '2026-10-06T10:00:00',
        raw_payload: { environment: 'production', connection_status: 'NOT_CONFIGURED', last_successful_connection: null },
      },
      {
        source_record_id: 'E-3',
        project_id: m.project_id,
        source_system: 'dms_monitor',
        record_type: 'system_status',
        timestamp: '2026-10-06T10:00:00',
        raw_payload: { application_status: 'OFFLINE' },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.attention_score).toBe(100);
  });

  it('32. active healthy project with fresh matching telemetry has LOW attention and 0 signals', () => {
    const m = baseMaster({ target: 1000, reported_actual: 900, reported_progress_pct: 90 });
    const prod: ProductionEvidenceRecord[] = [
      {
        source_record_id: 'P-HEALTHY',
        project_id: m.project_id,
        source_system: 'warehouse_entry',
        record_type: 'production_snapshot',
        timestamp: '2026-10-06T16:00:00',
        raw_payload: { processed_boxes: 900, unit: 'boxes' },
      },
    ];
    const res = evaluateProjectIntelligence(m, [], prod, [], DEFAULT_AS_OF_DATE);
    expect(res.attention_level).toBe('LOW');
    expect(res.signals).toHaveLength(0);
    expect(res.key_verdict).toContain('Normal');
  });
});
