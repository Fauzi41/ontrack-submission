import path from 'node:path';
import { fileURLToPath } from 'node:url';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../backend/src/app.js';
import { OnTrackDatabase } from '../backend/src/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../data');

function setupTestApp() {
  const db = new OnTrackDatabase(':memory:');
  db.ingestFromDirectory(DATA_DIR, 'STARTUP');
  const app = createApp({ db, dataDir: DATA_DIR });
  return { db, app };
}

describe('app.ts — REST API Endpoints, Section 11 Closure, Live Data Editor & Persona RBAC (20 tests)', () => {
  it('1. GET /api/health returns service status, default_as_of_date, and 6 loaded projects', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.projects_loaded).toBe(6);
    expect(res.body.default_as_of_date).toBe('2026-10-06T17:00:00');
    db.close();
  });

  it('2. GET /api/portfolio returns sorted projects with KPIs and available_pics directory', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).get('/api/portfolio');
    expect(res.status).toBe(200);
    expect(res.body.kpis.total_projects).toBe(6);
    expect(res.body.kpis.critical_attention).toBe(2);
    expect(res.body.kpis.high_attention).toBe(3);
    expect(res.body.kpis.low_or_verified).toBe(1);
    expect(res.body.projects[0].attention_level).toBe('CRITICAL');
    expect(res.body.available_pics).toHaveLength(6);
    db.close();
  });

  it('3. GET /api/portfolio?asOf=invalid returns 400 validation error', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).get('/api/portfolio?asOf=not-a-date');
    expect(res.status).toBe(400);
    db.close();
  });

  it('4. GET /api/projects/:id returns full project detail including 7 deadline calculation steps for PRJ-002', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).get('/api/projects/PRJ-002');
    expect(res.status).toBe(200);
    expect(res.body.project_id).toBe('PRJ-002');
    expect(res.body.deadline_analysis.calculation_steps).toHaveLength(7);
    expect(res.body.timeline.length).toBeGreaterThan(0);
    db.close();
  });

  it('5. GET /api/projects/:id returns 404 for unknown project', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).get('/api/projects/PRJ-UNKNOWN');
    expect(res.status).toBe(404);
    db.close();
  });

  it('6. POST /api/followups validates schema (400) and rejects unknown project (404)', async () => {
    const { db, app } = setupTestApp();
    const badSchema = await request(app).post('/api/followups').send({ project_id: 'PRJ-005' });
    expect(badSchema.status).toBe(400);

    const unknownProj = await request(app).post('/api/followups').send({
      project_id: 'PRJ-404',
      title: 'Valid title',
      description: 'Valid description',
      owner: 'Kevin',
    });
    expect(unknownProj.status).toBe(404);
    db.close();
  });

  it('7. POST/GET/PATCH /api/followups supports full lifecycle and enforces AWAITING_EVIDENCE on RESOLVED', async () => {
    const { db, app } = setupTestApp();
    const created = await request(app).post('/api/followups').send({
      project_id: 'PRJ-005',
      title: 'Escalate production access',
      description: 'Follow up with customer IT lead',
      owner: 'Kevin',
      priority: 'HIGH',
      due_date: '2026-10-07',
      evidence_refs: ['API-EPS-002'],
    });
    expect(created.status).toBe(201);

    const list = await request(app).get('/api/followups?projectId=PRJ-005');
    expect(list.status).toBe(200);
    expect(list.body.followups).toHaveLength(1);

    const resolved = await request(app)
      .patch(`/api/followups/${created.body.followup_id}`)
      .send({ action_status: 'RESOLVED', note: 'Credentials received', changed_at: '2026-10-06T18:00:00' });
    expect(resolved.status).toBe(200);
    expect(resolved.body.verification_status).toBe('AWAITING_EVIDENCE');
    db.close();
  });

  it('8. POST /api/followups/:id/verify rejects pre-resolution evidence (400) and accepts post-resolution evidence (200)', async () => {
    const { db, app } = setupTestApp();
    const created = await request(app).post('/api/followups').send({
      project_id: 'PRJ-005',
      title: 'Escalate access',
      description: 'Need prod credentials',
      owner: 'Kevin',
    });
    const fuId = created.body.followup_id;
    await request(app)
      .patch(`/api/followups/${fuId}`)
      .send({ action_status: 'RESOLVED', changed_at: '2026-10-06T18:00:00' });

    const preRes = await request(app)
      .post(`/api/followups/${fuId}/verify`)
      .send({ source_record_id: 'API-EPS-002', note: 'Old snapshot' });
    expect(preRes.status).toBe(400);

    await request(app).post('/api/ingest').send({
      prodJson: JSON.stringify({
        records: [
          {
            source_record_id: 'API-EPS-LIVE-99',
            project_id: 'PRJ-005',
            source_system: 'api_monitor',
            record_type: 'environment_check',
            timestamp: '2026-10-07T09:00:00',
            environment: 'production',
            connection_status: 'CONNECTED',
            last_successful_connection: '2026-10-07T08:58:00',
          },
        ],
      }),
    });

    const okRes = await request(app)
      .post(`/api/followups/${fuId}/verify`)
      .send({ source_record_id: 'API-EPS-LIVE-99', note: 'Confirmed CONNECTED' });
    expect(okRes.status).toBe(200);
    expect(okRes.body.verification_status).toBe('VERIFIED_BY_EVIDENCE');
    db.close();
  });

  it('9. POST /api/refresh executes idempotent disk refresh', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).post('/api/refresh');
    expect(res.status).toBe(200);
    expect(res.body.updates_duplicate_skipped).toBe(23);
    expect(res.body.production_duplicate_skipped).toBe(12);
    db.close();
  });

  it('10. POST /api/ingest rejects empty payload (400) and ingests valid ad-hoc CSV/JSON (200)', async () => {
    const { db, app } = setupTestApp();
    const empty = await request(app).post('/api/ingest').send({});
    expect(empty.status).toBe(400);

    const ok = await request(app).post('/api/ingest').send({
      updatesCsv:
        'update_id,project_id,timestamp,source_type,source_name,message\nUPD-ADHOC-1,PRJ-003,2026-10-06T16:55:00,PROJECT_MANAGER,Andi,Rekap terbaru sudah dikirim.',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.updates_inserted).toBe(1);
    db.close();
  });

  it('11. POST /api/data/master updates project master and triggers instant recalculation', async () => {
    const { db, app } = setupTestApp();
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
    expect(res.status).toBe(200);
    expect(res.body.project.deadline_analysis.required_daily_rate_reported).toBe(3000);
    db.close();
  });

  it('12. POST /api/data/production appends operational snapshot and recalculates operational metrics', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).post('/api/data/production').send({
      project_id: 'PRJ-002',
      source_system: 'scanner_production_log',
      record_type: 'production_snapshot',
      timestamp: '2026-10-06T16:30:00',
      metrics: { pages_processed_total: 108000, unit: 'pages' },
    });
    expect(res.status).toBe(201);
    expect(res.body.project.deadline_analysis.operational_verified_actual).toBe(108000);
    expect(res.body.project.deadline_analysis.required_daily_rate_operational).toBe(3000);
    db.close();
  });

  it('13. POST /api/data/updates appends field update and refreshes stated daily capacity', async () => {
    const { db, app } = setupTestApp();
    const res = await request(app).post('/api/data/updates').send({
      project_id: 'PRJ-002',
      timestamp: '2026-10-06T16:40:00',
      source_type: 'PROJECT_MANAGER',
      source_name: 'Nadia',
      message: 'Tambahan shift aktif, kapasitas tim menjadi 9.000 halaman per hari.',
    });
    expect(res.status).toBe(201);
    expect(res.body.project.deadline_analysis.stated_capacity_per_day).toBe(9000);
    db.close();
  });

  it('14. POST /api/data/reset restores initial authoritative dataset (not empty)', async () => {
    const { db, app } = setupTestApp();
    await request(app).post('/api/data/master').send({
      project_id: 'PRJ-002',
      customer: 'Instansi Beta',
      project_name: 'Digitalisasi Arsip Beta',
      project_type: 'Document Digitalisation',
      pic: 'Nadia',
      start_date: '2026-09-10',
      deadline: '2026-10-10',
      target: 120000,
      target_unit: 'pages',
      reported_actual: 119000,
      reported_progress_pct: 99.17,
      reported_status: 'ON TRACK',
      last_reported_update_at: '2026-10-06T16:00:00',
    });
    const resetRes = await request(app).post('/api/data/reset').send({ resetFollowUps: false });
    expect(resetRes.status).toBe(200);
    const restored = await request(app).get('/api/projects/PRJ-002');
    expect(restored.body.master.reported_actual).toBe(91500);
    expect(restored.body.operational_summary.verified_quantity).toBe(87240);
    db.close();
  });

  it('15. Persona RBAC: GET /api/portfolio as PIC Andi scopes KPIs to 1 project (PRJ-003)', async () => {
    const { db, app } = setupTestApp();
    const andiHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Andi' };
    const res = await request(app).get('/api/portfolio').set(andiHeaders);
    expect(res.status).toBe(200);
    expect(res.body.kpis.total_projects).toBe(1);
    expect(res.body.kpis.critical_attention).toBe(0);
    expect(res.body.kpis.high_attention).toBe(1);
    expect(res.body.projects).toHaveLength(1);
    expect(res.body.projects[0].project_id).toBe('PRJ-003');
    db.close();
  });

  it('16. Persona RBAC: PIC Andi can read own PRJ-003 (200) but is blocked (403) from Maya PRJ-006', async () => {
    const { db, app } = setupTestApp();
    const andiHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Andi' };
    expect((await request(app).get('/api/projects/PRJ-003').set(andiHeaders)).status).toBe(200);
    expect((await request(app).get('/api/projects/PRJ-006').set(andiHeaders)).status).toBe(403);
    db.close();
  });

  it('17. Persona RBAC: PIC Kevin cannot edit master or post updates on Maya PRJ-006 (403)', async () => {
    const { db, app } = setupTestApp();
    const kevinHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Kevin' };
    const editRes = await request(app)
      .post('/api/data/master')
      .set(kevinHeaders)
      .send({
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
    expect(editRes.status).toBe(403);

    const updRes = await request(app)
      .post('/api/data/updates')
      .set(kevinHeaders)
      .send({
        project_id: 'PRJ-006',
        timestamp: '2026-10-06T16:30:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'Kevin',
        message: 'Unauthorized cross-PIC update',
      });
    expect(updRes.status).toBe(403);
    db.close();
  });

  it('18. Persona RBAC: PIC Kevin cannot inject operational evidence, verify follow-ups, or create new projects (403)', async () => {
    const { db, app } = setupTestApp();
    const kevinHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Kevin' };

    const prodRes = await request(app)
      .post('/api/data/production')
      .set(kevinHeaders)
      .send({
        project_id: 'PRJ-005',
        source_system: 'api_monitor',
        record_type: 'environment_check',
        timestamp: '2026-10-06T16:30:00',
        metrics: { environment: 'production', connection_status: 'CONNECTED' },
      });
    expect(prodRes.status).toBe(403);

    const fu = await request(app).post('/api/followups').set(kevinHeaders).send({
      project_id: 'PRJ-005',
      title: 'Own follow-up',
      description: 'Valid own follow-up',
      owner: 'Kevin',
    });
    expect(fu.status).toBe(201);

    const verifyRes = await request(app)
      .post(`/api/followups/${fu.body.followup_id}/verify`)
      .set(kevinHeaders)
      .send({ source_record_id: 'API-EPS-002', note: 'Self verify' });
    expect(verifyRes.status).toBe(403);

    const newProjRes = await request(app)
      .post('/api/data/master')
      .set(kevinHeaders)
      .send({
        project_id: 'PRJ-777',
        customer: 'C',
        project_name: 'Unauthorized Project',
        project_type: 'System Integration',
        pic: 'Kevin',
        start_date: '2026-09-01',
        deadline: '2026-10-20',
        target: 10,
        target_unit: 'endpoints',
        reported_actual: 5,
        reported_progress_pct: 50,
        reported_status: 'ON TRACK',
        last_reported_update_at: '2026-10-06T16:00:00',
      });
    expect(newProjRes.status).toBe(403);
    db.close();
  });

  it('19. Persona RBAC: PIC Kevin can edit & reset OWN project PRJ-005 (scope=OWN) while blocked on ALL/Maya reset', async () => {
    const { db, app } = setupTestApp();
    const kevinHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Kevin' };

    const editOwn = await request(app)
      .post('/api/data/master')
      .set(kevinHeaders)
      .send({
        project_id: 'PRJ-005',
        customer: 'Instansi Epsilon',
        project_name: 'Integrasi API Epsilon',
        project_type: 'System Integration',
        pic: 'Kevin',
        start_date: '2026-09-01',
        deadline: '2026-10-13',
        target: 10,
        target_unit: 'endpoints',
        reported_actual: 10,
        reported_progress_pct: 100,
        reported_status: 'ON TRACK',
        last_reported_update_at: '2026-10-06T16:45:00',
      });
    expect(editOwn.status).toBe(200);
    expect(editOwn.body.project.master.reported_actual).toBe(10);

    expect(
      (await request(app).post('/api/data/reset').set(kevinHeaders).send({ scope: 'ALL' })).status
    ).toBe(403);
    expect(
      (await request(app).post('/api/data/reset').set(kevinHeaders).send({ projectId: 'PRJ-006' }))
        .status
    ).toBe(403);

    const resetOwn = await request(app)
      .post('/api/data/reset')
      .set(kevinHeaders)
      .send({ scope: 'OWN' });
    expect(resetOwn.status).toBe(200);

    const restored = await request(app).get('/api/projects/PRJ-005').set(kevinHeaders);
    expect(restored.body.master.reported_actual).toBe(9);
    db.close();
  });

  it('20. Persona RBAC: PIC blocked from cross-PIC follow-ups, raw /api/ingest, /api/refresh, and /api/ingestion/runs', async () => {
    const { db, app } = setupTestApp();
    const andiHeaders = { 'X-Actor-Role': 'PIC', 'X-Actor-Name': 'Andi' };

    expect(
      (
        await request(app).post('/api/followups').set(andiHeaders).send({
          project_id: 'PRJ-006',
          title: 'Cross PIC',
          description: 'Should fail',
          owner: 'Andi',
        })
      ).status
    ).toBe(403);
    expect((await request(app).get('/api/followups?projectId=PRJ-006').set(andiHeaders)).status).toBe(403);
    expect((await request(app).post('/api/refresh').set(andiHeaders)).status).toBe(403);
    expect((await request(app).post('/api/ingest').set(andiHeaders).send({ prodJson: '{}' })).status).toBe(403);
    expect((await request(app).get('/api/ingestion/runs').set(andiHeaders)).status).toBe(403);
    expect((await request(app).get('/api/ingestion/runs')).status).toBe(200);
    db.close();
  });
});
