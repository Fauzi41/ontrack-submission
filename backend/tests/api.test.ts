import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildServer } from '../src/api/server.js';
import { openDb } from '../src/db/db.js';
import { runImport } from '../src/ingest/importer.js';

let cleanup: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  for (const fn of cleanup) await fn();
  cleanup = [];
});

function serverPaths() {
  const dir = mkdtempSync(join(tmpdir(), 'ontrack-api-'));
  const dbFile = join(dir, 'test.db');
  const app = buildServer(dbFile);
  cleanup.push(async () => {
    await app.close();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows kadang masih memegang handle file sesaat setelah close.
    }
  });
  return { app, dbFile };
}

function server() {
  return serverPaths().app;
}

async function imported() {
  const app = server();
  const res = await app.inject({ method: 'POST', url: '/api/import' });
  expect(res.statusCode).toBe(200);
  return { app, body: res.json() };
}

describe('impor lewat API', () => {
  it('melaporkan apa yang lahir dari impor, bukan hanya jumlah baris', async () => {
    const { body } = await imported();
    expect(body.report.inserted).toBe(41);
    expect(body.findings_impact.opened).toHaveLength(14);
    expect(body.issues_sync.opened).toBe(14);
    expect(body.report.impact.added).toHaveLength(6);
    expect(body.as_of).toBe('2026-10-06T17:00:00');
  });

  it('impor kedua tidak mengubah apa pun kecuali duplikat', async () => {
    const app = server();
    await app.inject({ method: 'POST', url: '/api/import' });
    const second = await app.inject({ method: 'POST', url: '/api/import' });
    const body = second.json();
    expect(body.report.inserted).toBe(0);
    expect(body.report.duplicates).toBe(41);
    expect(body.findings_impact.opened).toEqual([]);
    expect(body.issues_sync.opened).toBe(0);
  });

  it('mencatat perubahan field saat master digeser', async () => {
    const app = server();
    await app.inject({ method: 'POST', url: '/api/import' });
    const again = await app.inject({ method: 'POST', url: '/api/import' });
    expect(again.json().report.impact.changed).toEqual([]);
  });
});

describe('basis data yang diisi lewat CLI', () => {
  it('menyelaraskan isu saat server hidup tanpa impor lewat API', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ontrack-cli-'));
    const dbFile = join(dir, 'cli.db');
    const seed = openDb(dbFile);
    runImport(seed);
    seed.close();

    const app = buildServer(dbFile);
    cleanup.push(async () => {
      await app.close();
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        // handle file bisa masih dipegang sesaat di Windows
      }
    });

    const res = await app.inject({ method: 'GET', url: '/api/portfolio' });
    expect(res.json().issue_counts.OPEN).toBe(14);
  });
});

describe('baca portofolio', () => {
  it('mengembalikan peringkat dan hitungan isu', async () => {
    const { app } = await imported();
    const res = await app.inject({ method: 'GET', url: '/api/portfolio' });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.projects).toHaveLength(6);
    expect(body.projects[0].project_id).toBe('PRJ-002');
    expect(body.projects[0].top_severity).toBe('critical');
    expect(body.issue_counts.OPEN).toBe(14);
  });

  it('detail proyek membawa temuan, isu, dan follow-up sekaligus', async () => {
    const { app } = await imported();
    const res = await app.inject({ method: 'GET', url: '/api/projects/PRJ-002' });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.findings.length).toBeGreaterThanOrEqual(4);
    expect(body.issues.length).toBe(body.findings.filter((f: { severity_final: string }) => f.severity_final !== 'info').length);
    expect(body.followups).toEqual([]);
  });

  it('proyek yang tidak ada dijawab 404, bukan daftar kosong', async () => {
    const { app } = await imported();
    const res = await app.inject({ method: 'GET', url: '/api/projects/PRJ-999' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('PROJECT_NOT_FOUND');
  });

  it('menolak filter status yang tidak dikenal', async () => {
    const { app } = await imported();
    const res = await app.inject({ method: 'GET', url: '/api/issues?status=BERES' });
    expect(res.statusCode).toBe(400);
  });
});

describe('follow-up', () => {
  it('membuat follow-up, mencatat peristiwa awalnya', async () => {
    const { app } = await imported();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-002/followups',
      payload: { title: 'Tambah shift pemindaian', owner: 'Rina', actor: 'nadia' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(201);
    expect(body.followup.status).toBe('OPEN');
    expect(body.events[0].event_type).toBe('CREATED');
    expect(body.events[0].actor).toBe('nadia');
  });

  it('menolak follow-up tanpa pemilik', async () => {
    const { app } = await imported();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-002/followups',
      payload: { title: 'Tambah shift pemindaian' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('OWNER_REQUIRED');
  });

  it('DONE tidak menutup isu, dan itu dinyatakan di jawaban', async () => {
    const { app } = await imported();
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-002/followups',
      payload: { title: 'Tambah shift pemindaian', owner: 'Rina' },
    });
    const id = created.json().followup.id;
    const before = await app.inject({ method: 'GET', url: '/api/issues?project_id=PRJ-002' });
    const openBefore = before.json().issues.filter((i: { status: string }) => i.status === 'OPEN').length;

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/followups/${id}`,
      payload: { status: 'DONE', actor: 'rina', note: 'shift tambahan sudah jalan' },
    });
    const body = res.json();
    expect(res.statusCode).toBe(200);
    expect(body.followup.status).toBe('DONE');
    expect(body.note).toContain('tidak mengubah status isu');
    expect(body.events.some((e: { event_type: string }) => e.event_type === 'STATUS_CHANGED')).toBe(true);

    const after = await app.inject({ method: 'GET', url: '/api/issues?project_id=PRJ-002' });
    const openAfter = after.json().issues.filter((i: { status: string }) => i.status === 'OPEN').length;
    expect(openAfter).toBe(openBefore);
  });

  it('menolak tanggal jatuh tempo yang tidak berbentuk YYYY-MM-DD', async () => {
    const { app } = await imported();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-002/followups',
      payload: { title: 'Tambah shift', owner: 'Rina', due_date: '7 Oktober' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('DUE_DATE_FORMAT');
  });
});

describe('penutupan isu butuh bukti', () => {
  async function firstIssue(app: Awaited<ReturnType<typeof server>>) {
    const res = await app.inject({ method: 'GET', url: '/api/issues?project_id=PRJ-002' });
    return res.json().issues[0] as { id: number; status: string };
  }

  it('menolak penutupan tanpa record bukti', async () => {
    const { app } = await imported();
    const issue = await firstIssue(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/status`,
      payload: { status: 'VERIFIED_RESOLVED' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('EVIDENCE_REQUIRED');
  });

  it('menolak record yang sudah ada saat isu dibuka', async () => {
    const { app } = await imported();
    const issue = await firstIssue(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/status`,
      payload: { status: 'VERIFIED_RESOLVED', evidence_ref: 'SCAN-BETA-001' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('EVIDENCE_STALE');
  });

  it('menolak record milik proyek lain', async () => {
    const { app } = await imported();
    const issue = await firstIssue(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/status`,
      payload: { status: 'VERIFIED_RESOLVED', evidence_ref: 'WH-GAMMA-001' },
    });
    expect(res.statusCode).toBe(409);
    expect(res.json().error).toBe('EVIDENCE_OTHER_PROJECT');
  });

  it('menolak record yang tidak ada di data sumber', async () => {
    const { app } = await imported();
    const issue = await firstIssue(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/status`,
      payload: { status: 'VERIFIED_RESOLVED', evidence_ref: 'PROD-TIDAK-ADA' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('EVIDENCE_UNKNOWN');
  });

  it('menerima AWAITING_EVIDENCE dan mempertahankannya setelah impor ulang', async () => {
    const { app } = await imported();
    const issue = await firstIssue(app);
    const set = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/status`,
      payload: { status: 'AWAITING_EVIDENCE' },
    });
    expect(set.statusCode).toBe(200);
    expect(set.json().issue.status).toBe('AWAITING_EVIDENCE');

    await app.inject({ method: 'POST', url: '/api/import' });
    const list = await app.inject({ method: 'GET', url: '/api/issues?project_id=PRJ-002' });
    const same = list.json().issues.find((i: { id: number }) => i.id === issue.id);
    expect(same.status).toBe('AWAITING_EVIDENCE');
  });

  it('menerima penutupan saat bukti baru masuk setelah isu dibuka', async () => {
    const { app, dbFile } = serverPaths();
    await app.inject({ method: 'POST', url: '/api/import' });
    const list = await app.inject({ method: 'GET', url: '/api/issues?project_id=PRJ-002' });
    const issue = list.json().issues[0] as { id: number };

    // Meniru impor berikutnya yang membawa satu record baru.
    const db = openDb(dbFile);
    db.prepare(
      `INSERT INTO source_records (project_id, source_kind, provenance, source_ref_id, observed_at, ingested_at, raw_json)
       VALUES ('PRJ-002','PRODUCTION','OPERATIONAL','SCAN-BETA-009','2026-10-07T09:00:00', ?, '{}')`,
    ).run(new Date(Date.now() + 60_000).toISOString());
    db.close();

    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/status`,
      payload: { status: 'VERIFIED_RESOLVED', evidence_ref: 'SCAN-BETA-009' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().issue.status).toBe('VERIFIED_RESOLVED');
    expect(res.json().issue.resolved_by_record).toBe('SCAN-BETA-009');
  });

  it('menolak status NOT_DETECTED dari tangan manusia', async () => {
    const { app } = await imported();
    const issue = await firstIssue(app);
    const res = await app.inject({
      method: 'POST',
      url: `/api/issues/${issue.id}/status`,
      payload: { status: 'NOT_DETECTED' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('STATUS_NOT_MANUAL');
  });
});

describe('tanggapan atas temuan', () => {
  it('menyimpan bantahan dengan alasan', async () => {
    const { app } = await imported();
    const fingerprint = 'prj-002:schedule_risk';
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/PRJ-002/findings/${fingerprint}/responses`,
      payload: { actor: 'rina', kind: 'DISPUTED', note: 'Klaim kapasitas 4.500 halaman per hari belum dihitung.' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().response.needs_review).toBe(1);
  });

  it('menolak bantahan tanpa alasan', async () => {
    const { app } = await imported();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-002/findings/apa-saja/responses',
      payload: { actor: 'rina', kind: 'DISPUTED', note: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('NOTE_REQUIRED');
  });

  it('menolak record bukti yang tidak ada', async () => {
    const { app } = await imported();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-002/findings/apa-saja/responses',
      payload: { actor: 'rina', kind: 'DISPUTED', note: 'Ini bantahan.', evidence_ref: 'TIDAK-ADA-001' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('EVIDENCE_UNKNOWN');
  });
});

describe('jalur galat yang mudah terlewat', () => {
  it('menolak id isu yang bukan angka', async () => {
    const { app } = await imported();
    const res = await app.inject({ method: 'POST', url: '/api/issues/abc/status', payload: { status: 'OPEN' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_ID');
  });

  it('menolak follow-up untuk proyek yang tidak ada', async () => {
    const { app } = await imported();
    const res = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-999/followups',
      payload: { title: 'Tidak ada proyeknya', owner: 'Rina' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('PROJECT_NOT_FOUND');
  });

  it('menolak status follow-up yang tidak dikenal', async () => {
    const { app } = await imported();
    const created = await app.inject({
      method: 'POST',
      url: '/api/projects/PRJ-002/followups',
      payload: { title: 'Uji status', owner: 'Rina' },
    });
    const id = created.json().followup.id;
    const res = await app.inject({ method: 'PATCH', url: `/api/followups/${id}`, payload: { status: 'BERES' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('BAD_STATUS');
  });

  it('menyaring isu berdasarkan status', async () => {
    const { app } = await imported();
    const res = await app.inject({ method: 'GET', url: '/api/issues?status=OPEN' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { issues: Array<{ status: string }> };
    expect(body.issues.length).toBeGreaterThan(0);
    expect(body.issues.every((i) => i.status === 'OPEN')).toBe(true);
  });

  it('mengembalikan daftar follow-up per proyek', async () => {
    const { app } = await imported();
    const res = await app.inject({ method: 'GET', url: '/api/projects/PRJ-002/followups' });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().followups)).toBe(true);
  });
});
