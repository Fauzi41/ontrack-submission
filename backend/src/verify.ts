import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { createApp } from './app.js';
import { DEFAULT_AS_OF_DATE, OnTrackDatabase } from './db.js';
import { evaluateProjectIntelligence } from './intelligenceEngine.js';
import { parseProductionDataJson, parseProjectMasterCsv } from './parsers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

interface CheckResult {
  index: number;
  group: string;
  name: string;
  passed: boolean;
  error?: string;
}

const results: CheckResult[] = [];

async function check(group: string, name: string, fn: () => void | Promise<void>) {
  const index = results.length + 1;
  try {
    await fn();
    results.push({ index, group, name, passed: true });
    console.log(`  [PASS ${String(index).padStart(2, '0')}] (${group}) ${name}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    results.push({ index, group, name, passed: false, error: message });
    console.error(`  [FAIL ${String(index).padStart(2, '0')}] (${group}) ${name} -> ${message}`);
  }
}

async function main() {
  console.log('=== OnTrack Backend Verification Suite (Routes & Data Integrity) ===\n');

  const db = new OnTrackDatabase(':memory:');
  const startupRun = db.ingestFromDirectory(DATA_DIR, 'STARTUP');
  const app = createApp({ db, dataDir: DATA_DIR });

  // =========================================================================
  // SECTION A: SOURCE FILES & DATA INTEGRITY (16 CHECKS)
  // =========================================================================
  await check('DATA', '02_Project_Master.csv exists and is non-empty', () => {
    const p = path.join(DATA_DIR, '02_Project_Master.csv');
    assert.equal(fs.existsSync(p), true);
    assert.ok(fs.statSync(p).size > 0);
  });

  await check('DATA', '03_Project_Updates.csv exists and is non-empty', () => {
    const p = path.join(DATA_DIR, '03_Project_Updates.csv');
    assert.equal(fs.existsSync(p), true);
    assert.ok(fs.statSync(p).size > 0);
  });

  await check('DATA', '04_Production_Data.json exists and is non-empty', () => {
    const p = path.join(DATA_DIR, '04_Production_Data.json');
    assert.equal(fs.existsSync(p), true);
    assert.ok(fs.statSync(p).size > 0);
  });

  await check('DATA', 'Startup ingestion loads 6 project masters', () => {
    assert.equal(startupRun.masters_upserted, 6);
  });

  await check('DATA', 'Startup ingestion loads 23 project updates', () => {
    assert.equal(startupRun.updates_inserted, 23);
  });

  await check('DATA', 'Startup ingestion loads 12 production records', () => {
    assert.equal(startupRun.production_inserted, 12);
  });

  await check('DATA', 'Startup ingestion has 0 quarantined records', () => {
    assert.equal(startupRun.quarantined_count, 0);
  });

  await check('DATA', 'Referential integrity: all updates link to existing master project_id', () => {
    const masterIds = new Set(db.getAllMasters().map((m) => m.project_id));
    for (const pid of masterIds) {
      for (const u of db.getUpdatesForProject(pid)) {
        assert.ok(masterIds.has(u.project_id));
      }
    }
    const totalUpdates = Array.from(masterIds).reduce(
      (sum, pid) => sum + db.getUpdatesForProject(pid).length,
      0
    );
    assert.equal(totalUpdates, 23);
  });

  await check('DATA', 'Referential integrity: all production records link to existing master project_id', () => {
    const masterIds = new Set(db.getAllMasters().map((m) => m.project_id));
    const totalProd = Array.from(masterIds).reduce(
      (sum, pid) => sum + db.getProductionForProject(pid).length,
      0
    );
    assert.equal(totalProd, 12);
  });

  const dupRun = db.ingestFromDirectory(DATA_DIR, 'DISK_REFRESH');
  await check('DATA', 'Idempotent refresh skips 23 duplicate updates without reinserting', () => {
    assert.equal(dupRun.updates_inserted, 0);
    assert.equal(dupRun.updates_duplicate_skipped, 23);
  });

  await check('DATA', 'Idempotent refresh skips 12 duplicate production records without reinserting', () => {
    assert.equal(dupRun.production_inserted, 0);
    assert.equal(dupRun.production_duplicate_skipped, 12);
  });

  const scratchDb = new OnTrackDatabase(':memory:');
  scratchDb.ingestFromDirectory(DATA_DIR, 'STARTUP');

  await check('DATA', 'Conflicting duplicate production ID is flagged and original preserved', () => {
    const run = scratchDb.ingestRawPayloads({
      prodJson: JSON.stringify({
        records: [
          {
            source_record_id: 'SCAN-BETA-003',
            project_id: 'PRJ-002',
            source_system: 'scanner_production_log',
            record_type: 'scanner_status',
            timestamp: '2026-10-06T15:30:00',
            scanners: [{ scanner_id: 'SCN-B', status: 'RUNNING' }],
          },
        ],
      }),
    });
    assert.equal(run.production_conflict_flagged, 1);
    const orig = scratchDb.getProductionRecordById('SCAN-BETA-003');
    const scnB = (orig?.raw_payload.scanners as Array<{ scanner_id: string; status: string }>).find(
      (s) => s.scanner_id === 'SCN-B'
    );
    assert.equal(scnB?.status, 'LIMITED');
  });

  await check('DATA', 'Conflicting duplicate update ID is flagged and original preserved', () => {
    const run = scratchDb.ingestRawPayloads({
      updatesCsv:
        'update_id,project_id,timestamp,source_type,source_name,message\nUPD-001,PRJ-006,2026-09-29T14:00:00,TECHNICAL_TEAM,Tim Teknis,Altered payload',
    });
    assert.equal(run.updates_conflict_flagged, 1);
  });

  await check('DATA', 'Older historical production snapshot archived without overwriting latest snapshot', () => {
    const run = scratchDb.ingestRawPayloads({
      prodJson: JSON.stringify({
        records: [
          {
            source_record_id: 'SCAN-BETA-HIST-001',
            project_id: 'PRJ-002',
            source_system: 'scanner_production_log',
            record_type: 'production_snapshot',
            timestamp: '2026-10-01T23:59:00',
            pages_processed_total: 60000,
            unit: 'pages',
          },
        ],
      }),
    });
    assert.equal(run.production_historical_backfill, 1);
    const evalP2 = evaluateProjectIntelligence(
      scratchDb.getMasterById('PRJ-002')!,
      scratchDb.getUpdatesForProject('PRJ-002'),
      scratchDb.getProductionForProject('PRJ-002'),
      [],
      DEFAULT_AS_OF_DATE
    );
    assert.equal(evalP2.operational_summary.verified_quantity, 87240);
  });

  await check('DATA', 'Resilience P6: invalid master CSV rows quarantined cleanly', () => {
    const res = parseProjectMasterCsv(
      'project_id,customer,project_name,project_type,pic,start_date,deadline,target,target_unit,reported_actual,reported_progress_pct,reported_status,last_reported_update_at\nPRJ-X,C,N,T,P,2026-10-10,2026-10-01,0,ML,abc,10,ON TRACK,2026-10-06T10:00:00'
    );
    assert.equal(res.records.length, 0);
    assert.equal(res.warnings.length, 1);
  });

  await check('DATA', 'Resilience P6: malformed JSON & non-numeric operational field quarantined cleanly', () => {
    const badSyntax = parseProductionDataJson('{broken');
    assert.equal(badSyntax.warnings[0].code, 'JSON_PARSE_ERROR');
    const badMetric = parseProductionDataJson(
      JSON.stringify({
        records: [
          {
            source_record_id: 'BAD-1',
            project_id: 'PRJ-001',
            source_system: 'sys',
            record_type: 'snap',
            timestamp: '2026-10-06T10:00:00',
            verified_quantity: 'NaN',
          },
        ],
      })
    );
    assert.equal(badMetric.records.length, 0);
    assert.equal(badMetric.warnings[0].code, 'INVALID_NUMERIC_VALUE');
  });

  scratchDb.close();

  // =========================================================================
  // SECTION B: 6-PROJECT INTELLIGENCE & DEADLINE MATH (18 CHECKS)
  // =========================================================================
  const evalProject = (id: string) =>
    evaluateProjectIntelligence(
      db.getMasterById(id)!,
      db.getUpdatesForProject(id),
      db.getProductionForProject(id),
      [],
      DEFAULT_AS_OF_DATE
    );

  const p1 = evalProject('PRJ-001');
  await check('INTEL', 'PRJ-001 detects explained workflow-state gap (301.5 + 16.5 = 318 ML)', () => {
    assert.equal(p1.attention_level, 'HIGH');
    assert.ok(p1.signals.some((s) => s.rule_code === 'R2A_WORKFLOW_STATE_GAP'));
  });
  await check('INTEL', 'PRJ-001 detects operational hold/rework risk (R4D)', () => {
    assert.ok(p1.signals.some((s) => s.rule_code === 'R4D_OPERATIONAL_HOLD_REWORK'));
  });
  await check('INTEL', 'PRJ-001 deadline math computes 9 remaining days and 10.94 ML/day verified required pace', () => {
    assert.equal(p1.deadline_analysis.remaining_days, 9);
    assert.equal(p1.deadline_analysis.required_daily_rate_operational, 10.94);
  });

  const p2 = evalProject('PRJ-002');
  await check('INTEL', 'PRJ-002 classified CRITICAL with MATHEMATICALLY_INFEASIBLE schedule verdict', () => {
    assert.equal(p2.attention_level, 'CRITICAL');
    assert.equal(p2.deadline_analysis.feasibility_verdict, 'MATHEMATICALLY_INFEASIBLE');
  });
  await check('INTEL', 'PRJ-002 deadline math computes 4 days left, 8190 req/day vs 4500 max capacity', () => {
    assert.equal(p2.deadline_analysis.remaining_days, 4);
    assert.equal(p2.deadline_analysis.required_daily_rate_operational, 8190);
    assert.equal(p2.deadline_analysis.stated_capacity_per_day, 4500);
  });
  await check('INTEL', 'PRJ-002 detects scanner degradation (SCN-B LIMITED) and +4,260 pages discrepancy', () => {
    assert.ok(p2.signals.some((s) => s.rule_code === 'R4A_OPERATIONAL_RESOURCE_DEGRADED'));
    assert.ok(p2.signals.some((s) => s.rule_code === 'R2B_REPORT_VS_OPERATIONAL_GAP'));
  });

  const p3 = evalProject('PRJ-003');
  await check('INTEL', 'PRJ-003 classified HIGH uncertainty with INSUFFICIENT_DATA verdict (no overclaim)', () => {
    assert.equal(p3.uncertainty_level, 'HIGH');
    assert.equal(p3.deadline_analysis.feasibility_verdict, 'INSUFFICIENT_DATA');
  });
  await check('INTEL', 'PRJ-003 detects 144-hour (6-day) staleness blind spot (R5)', () => {
    assert.ok(p3.signals.some((s) => s.rule_code === 'R5_DATA_STALENESS_BLIND_SPOT'));
    assert.equal(p3.operational_summary.hours_since_last_operational, 144);
  });
  await check('INTEL', 'PRJ-003 detects +2.0% report arithmetic mismatch (92% computed vs 94% reported)', () => {
    assert.ok(p3.signals.some((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH'));
    assert.equal(p3.deadline_analysis.computed_reported_pct, 92);
  });

  const p4 = evalProject('PRJ-004');
  await check('INTEL', 'PRJ-004 detects +7.0% report arithmetic mismatch (45% computed vs 52% reported)', () => {
    assert.ok(p4.signals.some((s) => s.rule_code === 'R1_REPORT_MATH_MISMATCH'));
    assert.equal(p4.deadline_analysis.computed_reported_pct, 45);
  });
  await check('INTEL', 'PRJ-004 deadline math computes 1833.33 req/day and +13 days projected slip', () => {
    assert.equal(p4.deadline_analysis.required_daily_rate_operational, 1833.33);
    assert.equal(p4.deadline_analysis.projected_slip_days_operational, 13);
  });
  await check('INTEL', 'PRJ-004 detects 3,200 skipped records (R4C) and missing operator capacity unknown', () => {
    assert.ok(p4.signals.some((s) => s.rule_code === 'R4C_DATA_QUALITY_SKIP'));
    assert.ok(p4.unknowns.some((u) => u.code === 'UNKNOWN_OPERATOR_CAPACITY'));
  });

  const p5 = evalProject('PRJ-005');
  await check('INTEL', 'PRJ-005 classified CRITICAL with 0/10 production-tested DoD gap (R2C)', () => {
    assert.equal(p5.attention_level, 'CRITICAL');
    assert.ok(p5.signals.some((s) => s.rule_code === 'R2C_VALIDATION_DOD_GAP'));
  });
  await check('INTEL', 'PRJ-005 detects production NOT_CONFIGURED (R4B) with 7 remaining days', () => {
    assert.ok(p5.signals.some((s) => s.rule_code === 'R4B_ENVIRONMENT_NOT_READY'));
    assert.equal(p5.deadline_analysis.remaining_days, 7);
  });
  await check('INTEL', 'PRJ-005 flags explicit unknown for missing external customer ETA', () => {
    assert.ok(p5.unknowns.some((u) => u.code === 'UNKNOWN_EXTERNAL_ETA'));
  });

  const p6 = evalProject('PRJ-006');
  await check('INTEL', 'PRJ-006 control baseline has LOW attention and 0 false alarms', () => {
    assert.equal(p6.attention_level, 'LOW');
    assert.equal(p6.signals.length, 0);
  });
  await check('INTEL', 'PRJ-006 schedule verdict is COMPLETED_ON_TIME', () => {
    assert.equal(p6.deadline_analysis.feasibility_verdict, 'COMPLETED_ON_TIME');
  });
  await check('INTEL', 'PRJ-006 operational telemetry confirms DMS ONLINE with 14 active users', () => {
    assert.equal(p6.operational_summary.dms_status?.application_status, 'ONLINE');
    assert.equal(p6.operational_summary.dms_status?.active_users_last_24h, 14);
  });

  // =========================================================================
  // SECTION C: REST API ROUTE CONTRACTS & EVIDENCE-BASED CLOSURE (16 CHECKS)
  // =========================================================================
  await check('ROUTE', 'GET /api/health returns 200 with status=ok and projects_loaded=6', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.projects_loaded, 6);
  });

  await check('ROUTE', 'GET /api/portfolio returns 200 with 6 projects and 6 available_pics', async () => {
    const res = await request(app).get('/api/portfolio');
    assert.equal(res.status, 200);
    assert.equal(res.body.kpis.total_projects, 6);
    assert.equal(res.body.available_pics.length, 6);
  });

  await check('ROUTE', 'GET /api/portfolio?asOf=invalid-date returns 400', async () => {
    const res = await request(app).get('/api/portfolio?asOf=invalid-date');
    assert.equal(res.status, 400);
  });

  await check('ROUTE', 'GET /api/projects/PRJ-002 returns 200 with 7 deadline calculation steps', async () => {
    const res = await request(app).get('/api/projects/PRJ-002');
    assert.equal(res.status, 200);
    assert.equal(res.body.deadline_analysis.calculation_steps.length, 7);
  });

  await check('ROUTE', 'GET /api/projects/PRJ-NOPE returns 404', async () => {
    const res = await request(app).get('/api/projects/PRJ-NOPE');
    assert.equal(res.status, 404);
  });

  await check('ROUTE', 'POST /api/followups with invalid payload returns 400', async () => {
    const res = await request(app).post('/api/followups').send({ project_id: 'PRJ-005' });
    assert.equal(res.status, 400);
  });

  let createdFollowUpId = '';
  await check('ROUTE', 'POST /api/followups valid returns 201 with OPEN status & audit history', async () => {
    const res = await request(app).post('/api/followups').send({
      project_id: 'PRJ-005',
      title: 'Escalate production access credentials',
      description: 'Confirm production URL and credentials with customer IT lead.',
      owner: 'Kevin',
      priority: 'HIGH',
      due_date: '2026-10-07',
      linked_signal_code: 'R4B_ENVIRONMENT_NOT_READY',
      evidence_refs: ['API-EPS-002'],
      created_at: '2026-10-06T16:00:00',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.action_status, 'OPEN');
    assert.equal(res.body.history.length, 1);
    createdFollowUpId = res.body.followup_id;
  });

  await check('ROUTE', 'PATCH /api/followups/:id to RESOLVED enforces AWAITING_EVIDENCE (Section 11)', async () => {
    const res = await request(app).patch(`/api/followups/${createdFollowUpId}`).send({
      action_status: 'RESOLVED',
      actor: 'Kevin',
      note: 'Customer sent credentials.',
      changed_at: '2026-10-06T18:00:00',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.verification_status, 'AWAITING_EVIDENCE');
  });

  await check('ROUTE', 'POST /api/followups/:id/verify rejects pre-resolution evidence with 400', async () => {
    const res = await request(app).post(`/api/followups/${createdFollowUpId}/verify`).send({
      source_record_id: 'API-EPS-002',
      note: 'Attempting reuse of pre-resolution evidence',
    });
    assert.equal(res.status, 400);
  });

  await check('ROUTE', 'POST /api/ingest accepts new post-resolution operational snapshot (200)', async () => {
    const res = await request(app).post('/api/ingest').send({
      prodJson: JSON.stringify({
        records: [
          {
            source_record_id: 'API-EPS-VERIFY-001',
            project_id: 'PRJ-005',
            source_system: 'api_monitor',
            record_type: 'environment_check',
            timestamp: '2026-10-07T09:00:00',
            environment: 'production',
            connection_status: 'CONNECTED',
            last_successful_connection: '2026-10-07T08:59:00',
          },
        ],
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.production_inserted, 1);
  });

  await check('ROUTE', 'POST /api/followups/:id/verify succeeds with post-resolution evidence -> VERIFIED_BY_EVIDENCE', async () => {
    const res = await request(app).post(`/api/followups/${createdFollowUpId}/verify`).send({
      source_record_id: 'API-EPS-VERIFY-001',
      actor: 'Director',
      note: 'Production environment confirmed CONNECTED.',
      verified_at: '2026-10-07T10:00:00',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.verification_status, 'VERIFIED_BY_EVIDENCE');
  });

  await check('ROUTE', 'GET /api/projects/PRJ-005?asOf=2026-10-07T12:00:00 clears R4B_ENVIRONMENT_NOT_READY', async () => {
    const res = await request(app).get('/api/projects/PRJ-005?asOf=2026-10-07T12:00:00');
    assert.equal(res.status, 200);
    assert.equal(
      res.body.signals.some((s: { rule_code: string }) => s.rule_code === 'R4B_ENVIRONMENT_NOT_READY'),
      false
    );
  });

  await check('ROUTE', 'POST /api/data/master updates PRJ-002 and immediately recalculates required pace', async () => {
    const res = await request(app).post('/api/data/master').send({
      project_id: 'PRJ-002',
      customer: 'Instansi Beta',
      project_name: 'Digitalisasi Arsip Beta',
      project_type: 'Document Digitalisation',
      pic: 'Nadia',
      start_date: '2026-09-10',
      deadline: '2026-10-10',
      target: 120000,
      target_unit: 'pages',
      reported_actual: 108000,
      reported_progress_pct: 90,
      reported_status: 'ON TRACK',
      last_reported_update_at: '2026-10-06T16:00:00',
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.project.deadline_analysis.required_daily_rate_reported, 3000);
  });

  await check('ROUTE', 'POST /api/data/production appends operational snapshot and recalculates verified actual', async () => {
    const res = await request(app).post('/api/data/production').send({
      project_id: 'PRJ-002',
      source_system: 'scanner_production_log',
      record_type: 'production_snapshot',
      timestamp: '2026-10-06T16:30:00',
      metrics: { pages_processed_total: 108000, unit: 'pages' },
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.project.deadline_analysis.operational_verified_actual, 108000);
  });

  await check('ROUTE', 'POST /api/data/updates appends field update (201) into timeline', async () => {
    const res = await request(app).post('/api/data/updates').send({
      project_id: 'PRJ-002',
      timestamp: '2026-10-06T16:45:00',
      source_type: 'PROJECT_MANAGER',
      source_name: 'Nadia',
      message: 'Kapasitas tim meningkat menjadi 9.000 halaman per hari.',
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.project.deadline_analysis.stated_capacity_per_day, 9000);
  });

  await check('ROUTE', 'POST /api/data/reset restores initial authoritative data (91,500 / 87,240 — not empty)', async () => {
    const resetRes = await request(app).post('/api/data/reset').send({ resetFollowUps: false });
    assert.equal(resetRes.status, 200);
    const p2Res = await request(app).get('/api/projects/PRJ-002');
    assert.equal(p2Res.body.deadline_analysis.reported_actual, 91500);
    assert.equal(p2Res.body.deadline_analysis.operational_verified_actual, 87240);
  });

  // =========================================================================
  // SECTION D: PERSONA RBAC ISOLATION (8 CHECKS)
  // =========================================================================
  const andiHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Andi' };
  const kevinHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Kevin' };

  await check('RBAC', 'GET /api/portfolio as PIC Andi scopes KPI total_projects=1 and returns only PRJ-003', async () => {
    const res = await request(app).get('/api/portfolio').set(andiHeaders);
    assert.equal(res.status, 200);
    assert.equal(res.body.kpis.total_projects, 1);
    assert.equal(res.body.projects.length, 1);
    assert.equal(res.body.projects[0].project_id, 'PRJ-003');
  });

  await check('RBAC', 'GET /api/projects/PRJ-006 (Maya) as PIC Andi returns 403 Forbidden', async () => {
    const res = await request(app).get('/api/projects/PRJ-006').set(andiHeaders);
    assert.equal(res.status, 403);
  });

  await check('RBAC', 'POST /api/data/master on PRJ-006 (Maya) as PIC Kevin returns 403 Forbidden', async () => {
    const res = await request(app).post('/api/data/master').set(kevinHeaders).send({
      project_id: 'PRJ-006',
      customer: 'Perusahaan Zeta',
      project_name: 'Implementasi DMS Zeta',
      project_type: 'DMS Implementation',
      pic: 'Maya',
      start_date: '2026-07-01',
      deadline: '2026-09-30',
      target: 1,
      target_unit: 'system',
      reported_actual: 0,
      reported_progress_pct: 0,
      reported_status: 'DELAYED',
      last_reported_update_at: '2026-10-06T16:00:00',
    });
    assert.equal(res.status, 403);
  });

  await check('RBAC', 'POST /api/data/updates on PRJ-006 (Maya) as PIC Kevin returns 403 Forbidden', async () => {
    const res = await request(app).post('/api/data/updates').set(kevinHeaders).send({
      project_id: 'PRJ-006',
      timestamp: '2026-10-06T16:30:00',
      source_type: 'PROJECT_MANAGER',
      source_name: 'Kevin',
      message: 'Cross-PIC update attempt',
    });
    assert.equal(res.status, 403);
  });

  await check('RBAC', 'POST /api/data/production as PIC Kevin returns 403 (Separation of Duties)', async () => {
    const res = await request(app).post('/api/data/production').set(kevinHeaders).send({
      project_id: 'PRJ-005',
      source_system: 'api_monitor',
      record_type: 'environment_check',
      timestamp: '2026-10-06T16:30:00',
      metrics: { environment: 'production', connection_status: 'CONNECTED' },
    });
    assert.equal(res.status, 403);
  });

  await check('RBAC', 'POST /api/followups/:id/verify as PIC Kevin returns 403 (Separation of Duties)', async () => {
    const res = await request(app)
      .post(`/api/followups/${createdFollowUpId}/verify`)
      .set(kevinHeaders)
      .send({ source_record_id: 'API-EPS-002', note: 'Self-verify attempt' });
    assert.equal(res.status, 403);
  });

  await check('RBAC', 'POST /api/data/reset blocks portfolio-wide reset for PIC (403) and allows scope=OWN (200)', async () => {
    const allRes = await request(app).post('/api/data/reset').set(kevinHeaders).send({ scope: 'ALL' });
    assert.equal(allRes.status, 403);
    const ownRes = await request(app).post('/api/data/reset').set(kevinHeaders).send({ scope: 'OWN' });
    assert.equal(ownRes.status, 200);
  });

  await check('RBAC', 'GET /api/ingestion/runs blocks PIC (403) and allows Director (200)', async () => {
    const picRes = await request(app).get('/api/ingestion/runs').set(andiHeaders);
    assert.equal(picRes.status, 403);
    const dirRes = await request(app).get('/api/ingestion/runs');
    assert.equal(dirRes.status, 200);
  });

  db.close();

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  console.log(`\n=== Verification Summary: ${passed}/${results.length} passed, ${failed} failed ===`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
