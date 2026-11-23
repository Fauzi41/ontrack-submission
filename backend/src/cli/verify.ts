/**
 * Verifikasi menyeluruh pada basis data sementara.
 *
 * Skrip ini menjalankan semua rute yang dipakai antarmuka, memeriksa kode jawaban
 * yang memang diharapkan, lalu memeriksa integritas data langsung di SQLite.
 * Basis data asli tidak disentuh.
 *
 * Jalankan: npm run verify -w backend
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { buildServer } from '../api/server.js';
import { openDb } from '../db/db.js';

interface Check {
  name: string;
  want: number | string;
  got: number | string;
  ok: boolean;
}

const checks: Check[] = [];
const dir = mkdtempSync(join(tmpdir(), 'ontrack-verify-'));
const dbFile = join(dir, 'verify.db');
const app: FastifyInstance = buildServer(dbFile);

function record(name: string, want: number | string, got: number | string): void {
  checks.push({ name, want, got, ok: String(want) === String(got) });
}

async function call(method: 'GET' | 'POST' | 'PATCH', url: string, payload?: unknown, expect = 200) {
  const res = await app.inject({ method, url, payload: payload as never });
  record(`${method} ${url}`, expect, res.statusCode);
  return res.json() as Record<string, any>;
}

async function main() {
  // ---- impor ----
  const first = await call('POST', '/api/import');
  record('impor pertama: baris masuk', 41, first.report.inserted);
  record('impor pertama: temuan baru', 14, first.findings_impact.opened.length);
  record('impor pertama: isu dibuka', 14, first.issues_sync.opened);

  const portfolioBefore = await call('GET', '/api/portfolio');
  const second = await call('POST', '/api/import');
  record('impor kedua: duplikat', 41, second.report.duplicates);
  record('impor kedua: baris baru', 0, second.report.inserted);
  record('impor kedua: temuan baru', 0, second.findings_impact.opened.length);
  const portfolioAfter = await call('GET', '/api/portfolio');
  record(
    'impor kedua tidak mengubah portofolio',
    'sama',
    JSON.stringify(portfolioBefore.projects) === JSON.stringify(portfolioAfter.projects) ? 'sama' : 'berbeda',
  );

  // ---- baca ----
  await call('GET', '/healthz');
  record('jumlah proyek', 6, portfolioAfter.projects.length);
  record('peringkat pertama', 'PRJ-002', portfolioAfter.projects[0].project_id);
  await call('GET', '/api/projects/PRJ-002');
  const missing = await app.inject({ method: 'GET', url: '/api/projects/PRJ-999' });
  record('proyek tak dikenal', 404, missing.statusCode);
  await call('GET', '/api/issues?project_id=PRJ-002');
  await call('GET', '/api/issues?status=OPEN');
  await app.inject({ method: 'GET', url: '/api/issues?status=BERES' }).then((r) => record('status tak dikenal', 400, r.statusCode));
  await call('GET', '/api/source-inventory');
  await call('GET', '/api/import-runs/latest');

  // ---- isu: gerbang bukti ----
  const issues = await call('GET', '/api/issues?project_id=PRJ-002');
  const issue = issues.issues[0] as { id: number; status: string };

  await call('POST', `/api/issues/${issue.id}/status`, { status: 'AWAITING_EVIDENCE' });
  const noEvidence = await app.inject({ method: 'POST', url: `/api/issues/${issue.id}/status`, payload: { status: 'VERIFIED_RESOLVED' } });
  record('tutup tanpa bukti', 422, noEvidence.statusCode);
  record('kode galat tanpa bukti', 'EVIDENCE_REQUIRED', noEvidence.json().error);

  const stale = await app.inject({
    method: 'POST',
    url: `/api/issues/${issue.id}/status`,
    payload: { status: 'VERIFIED_RESOLVED', evidence_ref: 'SCAN-BETA-001' },
  });
  record('tutup dengan record lama', 409, stale.statusCode);
  record('kode galat record lama', 'EVIDENCE_STALE', stale.json().error);

  const otherProject = await app.inject({
    method: 'POST',
    url: `/api/issues/${issue.id}/status`,
    payload: { status: 'VERIFIED_RESOLVED', evidence_ref: 'WH-GAMMA-001' },
  });
  record('tutup dengan record proyek lain', 409, otherProject.statusCode);

  const unknownRecord = await app.inject({
    method: 'POST',
    url: `/api/issues/${issue.id}/status`,
    payload: { status: 'VERIFIED_RESOLVED', evidence_ref: 'TIDAK-ADA-001' },
  });
  record('tutup dengan record fiktif', 422, unknownRecord.statusCode);

  // record baru masuk, lalu isu boleh ditutup
  const db = openDb(dbFile);
  db.prepare(
    `INSERT INTO source_records (project_id, source_kind, provenance, source_ref_id, observed_at, ingested_at, raw_json)
     VALUES ('PRJ-002','PRODUCTION','OPERATIONAL','VERIFY-NEW-001','2026-10-07T09:00:00', ?, '{}')`,
  ).run(new Date(Date.now() + 60_000).toISOString());
  db.close();
  const closed = await call('POST', `/api/issues/${issue.id}/status`, {
    status: 'VERIFIED_RESOLVED',
    evidence_ref: 'VERIFY-NEW-001',
  });
  record('tutup dengan bukti baru', 'VERIFIED_RESOLVED', closed.issue.status);
  record('record penutup disimpan', 'VERIFY-NEW-001', closed.issue.resolved_by_record);

  // ---- follow-up ----
  const created = await call('POST', '/api/projects/PRJ-002/followups', {
    title: 'Verifikasi tata cara penutupan isu',
    owner: 'Rina',
  }, 201);
  record('follow-up dibuat', 'OPEN', created.followup.status);

  const noOwner = await app.inject({ method: 'POST', url: '/api/projects/PRJ-002/followups', payload: { title: 'Tanpa pemilik' } });
  record('follow-up tanpa pemilik', 400, noOwner.statusCode);

  const issuesBeforeDone = await call('GET', '/api/issues?project_id=PRJ-002');
  const openBefore = (issuesBeforeDone.issues as Array<{ status: string }>).filter((i) => i.status === 'OPEN').length;
  const done = await call('PATCH', `/api/followups/${created.followup.id}`, { status: 'DONE' });
  record('follow-up selesai', 'DONE', done.followup.status);
  record('jawaban menyebut isu tidak berubah', 'ya', String(done.note).includes('tidak mengubah status isu') ? 'ya' : 'tidak');
  const issuesAfterDone = await call('GET', '/api/issues?project_id=PRJ-002');
  const openAfter = (issuesAfterDone.issues as Array<{ status: string }>).filter((i) => i.status === 'OPEN').length;
  record('isu terbuka tidak bergerak', openBefore, openAfter);
  await call('GET', `/api/followups/${created.followup.id}`);
  await app.inject({ method: 'GET', url: '/api/followups/FU-TIDAK-ADA' }).then((r) => record('follow-up tak dikenal', 404, r.statusCode));

  // ---- tanggapan ----
  await call('POST', '/api/projects/PRJ-002/findings/schedule_risk:main/responses', {
    kind: 'DISPUTED',
    note: 'Klaim kapasitas 4.500 halaman per hari belum dihitung.',
  }, 201);
  const emptyNote = await app.inject({
    method: 'POST',
    url: '/api/projects/PRJ-002/findings/schedule_risk:main/responses',
    payload: { kind: 'DISPUTED', note: '' },
  });
  record('tanggapan tanpa alasan', 400, emptyNote.statusCode);
  await call('GET', '/api/projects/PRJ-002/findings/schedule_risk:main/responses');

  // ---- tinjauan ----
  const queue = await call('GET', '/api/review');
  record('antrean tinjauan berisi satu bantahan', 1, queue.total);
  const reviewId = (queue.queue as Array<{ id: number }>)[0]?.id ?? 0;
  const decided = await call('POST', `/api/responses/${reviewId}/review`, {
    actor: 'budi',
    decision: 'UPHELD',
    note: 'Dua unit cadangan berjalan sejak 2 Oktober, kapasitas perlu dihitung ulang.',
  });
  record('keputusan tercatat', 'UPHELD', decided.response.review_decision);
  const afterReview = await call('GET', '/api/review');
  record('antrean kosong setelah diputuskan', 0, afterReview.total);

  const reviewedFinding = (
    (await call('GET', '/api/projects/PRJ-002')).findings as Array<{ fingerprint: string; severity_final: string }>
  ).find((f) => f.fingerprint === 'schedule_risk:main');
  record('severity tidak berubah karena keputusan', 'critical', reviewedFinding?.severity_final ?? 'hilang');

  // ---- integritas data ----
  const conn = openDb(dbFile);
  const integrity = [
    {
      name: 'setiap bukti temuan ada di source_records',
      value: integrityEvidence(conn, portfolioAfter),
    },
    {
      name: 'setiap isu punya temuan yang hidup',
      value: issuesMatchFindings(conn, portfolioAfter),
    },
    {
      name: 'tidak ada nilai observasi tanpa proyek',
      value: countZero(conn, 'SELECT COUNT(*) c FROM observation_values v LEFT JOIN source_records r ON r.id = v.record_id WHERE r.project_id IS NULL'),
    },
    {
      name: 'jumlah baris per proyek sama dengan total',
      value: perProjectTotal(conn),
    },
  ];
  for (const item of integrity) record(item.name, 'bersih', item.value);
  conn.close();

  // ---- ringkasan ----
  const failed = checks.filter((c) => !c.ok);
  for (const c of checks) {
    console.log(`${c.ok ? 'OK  ' : 'GAGAL'}  ${c.name}  (ingin ${c.want}, dapat ${c.got})`);
  }
  console.log(`\n${checks.length - failed.length}/${checks.length} pemeriksaan lulus`);
  if (failed.length > 0) {
    console.log('yang gagal:', failed.map((f) => f.name).join(', '));
    process.exitCode = 1;
  }
}

function integrityEvidence(conn: ReturnType<typeof openDb>, portfolio: Record<string, any>): string {
  const missing: string[] = [];
  for (const project of portfolio.projects as Array<Record<string, any>>) {
    for (const finding of project.findings as Array<Record<string, any>>) {
      for (const ev of finding.evidence as Array<{ ref_id: string }>) {
        const row = conn.prepare('SELECT 1 FROM source_records WHERE source_ref_id = ?').get(ev.ref_id);
        if (!row) missing.push(`${project.project_id}/${finding.fingerprint}/${ev.ref_id}`);
      }
    }
  }
  return missing.length === 0 ? 'bersih' : `hilang ${missing.slice(0, 3).join(', ')}`;
}

function issuesMatchFindings(conn: ReturnType<typeof openDb>, portfolio: Record<string, any>): string {
  const live = new Set<string>();
  for (const project of portfolio.projects as Array<Record<string, any>>) {
    for (const finding of project.findings as Array<Record<string, any>>) {
      if (finding.severity_final !== 'info') live.add(`${project.project_id}|${finding.fingerprint}`);
    }
  }
  const issues = conn.prepare("SELECT project_id, fingerprint FROM issues WHERE status != 'NOT_DETECTED'").all() as Array<{
    project_id: string;
    fingerprint: string;
  }>;
  const orphans = issues.filter((i) => !live.has(`${i.project_id}|${i.fingerprint}`));
  return orphans.length === 0 ? 'bersih' : `${orphans.length} isu tanpa temuan`;
}

function countZero(conn: ReturnType<typeof openDb>, sql: string): string {
  const row = conn.prepare(sql).get() as { c: number };
  return row.c === 0 ? 'bersih' : `${row.c} baris`;
}

function perProjectTotal(conn: ReturnType<typeof openDb>): string {
  const one = conn.prepare('SELECT COUNT(*) c FROM source_records').get() as { c: number };
  const many = conn.prepare('SELECT COALESCE(SUM(c),0) s FROM (SELECT COUNT(*) c FROM source_records GROUP BY project_id)').get() as {
    s: number;
  };
  return one.c === many.s ? 'bersih' : `total ${one.c} vs per proyek ${many.s}`;
}

main()
  .catch((err) => {
    console.error('verifikasi berhenti:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await app.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows kadang menahan handle sesaat
    }
  });
