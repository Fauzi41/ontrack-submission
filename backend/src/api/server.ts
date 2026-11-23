import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { REPO_ROOT } from '../config';
import { openDb } from '../db/db';
import { ImportError, currentAsOf, runImport } from '../ingest/importer';
import { assemblePortfolio } from '../interpret/engine';
import { loadFacts, readAsOf } from '../interpret/load';
import { ISSUE_STATUSES, IssueError, type IssueStatus, listIssues, setIssueStatus, syncIssues } from '../store/issues';
import {
  FollowupError,
  createFollowup,
  getFollowup,
  listEvents,
  listFollowups,
  updateFollowup,
} from '../store/followups';
import { ResponseError, addResponse, listResponses, listReviewQueue, reviewResponse } from '../store/responses';
import { diffFindings } from './impact';

const nowIso = (): string => new Date().toISOString();

function fail(reply: FastifyReply, err: unknown) {
  if (err instanceof IssueError) {
    const code =
      err.code === 'ISSUE_NOT_FOUND'
        ? 404
        : err.code === 'EVIDENCE_STALE' || err.code === 'EVIDENCE_OTHER_PROJECT'
          ? 409
          : 422;
    return reply.code(code).send({ error: err.code, message: err.message });
  }
  if (err instanceof FollowupError) {
    const code =
      err.code === 'FOLLOWUP_NOT_FOUND' || err.code === 'PROJECT_NOT_FOUND'
        ? 404
        : err.code === 'DUPLICATE_FOLLOWUP'
          ? 409
          : 400;
    return reply.code(code).send({ error: err.code, message: err.message });
  }
  if (err instanceof ResponseError) {
    const code =
      err.code === 'REVIEW_NOT_FOUND' || err.code === 'FINDING_NOT_FOUND'
        ? 404
        : err.code === 'ALREADY_REVIEWED'
          ? 409
          : err.code === 'EVIDENCE_UNKNOWN'
            ? 422
            : 400;
    return reply.code(code).send({ error: err.code, message: err.message });
  }
  if (err instanceof ImportError) {
    return reply.code(422).send({ error: err.code, message: err.message });
  }
  throw err;
}

export function buildServer(dbPath?: string) {
  const db = openDb(dbPath);
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

  // DB ditutup bersama server. Tanpa ini, file database tetap terkunci setelah
  // test selesai dan pembersihan direktori sementara gagal di Windows.
  app.addHook('onClose', async () => {
    db.close();
  });

  const portfolioNow = () => {
    const asOf = readAsOf(db);
    return assemblePortfolio(asOf, loadFacts(db, asOf));
  };

  // Isu diselaraskan sekali saat server hidup. Tanpa ini, basis data yang diisi
  // lewat CLI akan menampilkan temuan tanpa satu pun baris isu, karena hanya rute
  // impor yang menyelaraskan.
  try {
    const boot = portfolioNow();
    if (boot.projects.length > 0) syncIssues(db, boot, boot.as_of ?? nowIso());
  } catch {
    // basis data baru atau belum punya data; tidak ada yang perlu diselaraskan
  }

  app.get('/healthz', async () => {
    const asOf = currentAsOf(db);
    const counts = db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM projects) AS projects,
                (SELECT COUNT(*) FROM source_records) AS source_records,
                (SELECT COUNT(*) FROM observation_values) AS observation_values`,
      )
      .get();
    return { ok: true, as_of: asOf, counts };
  });

  app.get('/api/portfolio', async () => {
    const portfolio = portfolioNow();
    const rows = db.prepare('SELECT status, COUNT(*) AS count FROM issues GROUP BY status').all() as Array<{
      status: string;
      count: number;
    }>;
    const issue_counts: Record<string, number> = {};
    for (const row of rows) issue_counts[row.status] = row.count;
    const review_queue = (
      db.prepare('SELECT COUNT(*) AS c FROM finding_responses WHERE needs_review = 1 AND reviewed_at IS NULL').get() as {
        c: number;
      }
    ).c;
    return { ...portfolio, issue_counts, review_queue };
  });

  app.get('/api/projects/:projectId', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const portfolio = portfolioNow();
    const assessment = portfolio.projects.find((p) => p.project_id === projectId);
    if (!assessment) {
      return reply.code(404).send({ error: 'PROJECT_NOT_FOUND', message: `Proyek ${projectId} tidak ada.` });
    }
    const responses = db.prepare('SELECT * FROM finding_responses WHERE project_id = ? ORDER BY id').all(projectId);
    return {
      ...assessment,
      issues: listIssues(db, projectId),
      followups: listFollowups(db, projectId),
      responses,
      as_of: portfolio.as_of,
    };
  });

  app.get('/api/issues', async (req, reply) => {
    const { status, project_id: projectId } = req.query as { status?: string; project_id?: string };
    if (status && !ISSUE_STATUSES.includes(status as IssueStatus)) {
      return reply
        .code(400)
        .send({ error: 'BAD_STATUS', message: `Status harus salah satu dari ${ISSUE_STATUSES.join(', ')}.` });
    }
    const where: string[] = [];
    const params: unknown[] = [];
    if (status) {
      where.push('i.status = ?');
      params.push(status);
    }
    if (projectId) {
      where.push('i.project_id = ?');
      params.push(projectId);
    }
    const sql = `SELECT i.*, p.project_name FROM issues i LEFT JOIN projects p ON p.project_id = i.project_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.project_id, i.id`;
    const issues = db.prepare(sql).all(...params);
    return { issues, filters: { status: status ?? null, project_id: projectId ?? null } };
  });

  app.post('/api/issues/:id/status', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id)) {
      return reply.code(400).send({ error: 'BAD_ID', message: 'Id isu harus angka.' });
    }
    const body = (req.body ?? {}) as { status?: string; evidence_ref?: string | null };
    try {
      const issue = setIssueStatus(db, id, body.status as IssueStatus, body.evidence_ref ?? null, nowIso());
      return { issue };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/projects/:projectId/followups', async (req) => {
    const { projectId } = req.params as { projectId: string };
    return { followups: listFollowups(db, projectId) };
  });

  app.post('/api/projects/:projectId/followups', async (req, reply) => {
    const { projectId } = req.params as { projectId: string };
    const body = (req.body ?? {}) as {
      title?: string;
      description?: string;
      owner?: string;
      owner_kind?: string;
      due_date?: string | null;
      issue_id?: number | null;
      fingerprint?: string | null;
      actor?: string;
    };
    try {
      const followup = createFollowup(db, projectId, body, body.actor ?? 'api', nowIso());
      return reply.code(201).send({ followup, events: listEvents(db, followup.id) });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/followups/:id', async (req, reply) => {
    try {
      const followup = getFollowup(db, (req.params as { id: string }).id);
      return { followup, events: listEvents(db, followup.id) };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.patch('/api/followups/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body ?? {}) as {
      status?: string;
      owner?: string;
      due_date?: string | null;
      note?: string;
      actor?: string;
    };
    try {
      const followup = updateFollowup(db, id, body, body.actor ?? 'api', nowIso());
      return {
        followup,
        events: listEvents(db, followup.id),
        note: 'Status follow-up tidak mengubah status isu. Isu hanya tertutup lewat bukti baru.',
      };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/projects/:projectId/findings/:fingerprint/responses', async (req) => {
    const { projectId, fingerprint } = req.params as { projectId: string; fingerprint: string };
    return { responses: listResponses(db, projectId, fingerprint) };
  });

  app.post('/api/projects/:projectId/findings/:fingerprint/responses', async (req, reply) => {
    const { projectId, fingerprint } = req.params as { projectId: string; fingerprint: string };
    const body = (req.body ?? {}) as { actor?: string; kind?: string; note?: string; evidence_ref?: string | null };
    const project = portfolioNow().projects.find((p) => p.project_id === projectId);
    if (!project) {
      return reply.code(404).send({ error: 'PROJECT_NOT_FOUND', message: `Proyek ${projectId} tidak ada.` });
    }
    if (!project.findings.some((f) => f.fingerprint === fingerprint)) {
      return reply
        .code(404)
        .send({ error: 'FINDING_NOT_FOUND', message: `Temuan ${fingerprint} tidak ada pada proyek ${projectId}.` });
    }
    try {
      const response = addResponse(db, projectId, fingerprint, { ...body, actor: body.actor ?? 'api' }, nowIso());
      return reply.code(201).send({ response });
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/review', async () => {
    const portfolio = portfolioNow();
    const queue = listReviewQueue(db).map((item) => {
      const finding = portfolio.projects
        .find((p) => p.project_id === item.project_id)
        ?.findings.find((f) => f.fingerprint === item.fingerprint);
      return { ...item, detector: finding?.detector ?? null, severity: finding?.severity_final ?? null };
    });
    const counts: Record<string, number> = {};
    for (const item of queue) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
    return { queue, counts, total: queue.length };
  });

  app.post('/api/responses/:id/review', async (req, reply) => {
    const id = Number((req.params as { id: string }).id);
    if (!Number.isInteger(id) || id <= 0) {
      return reply.code(400).send({ error: 'BAD_ID', message: 'Id tanggapan harus angka.' });
    }
    const body = (req.body ?? {}) as { decision?: string; note?: string; actor?: string };
    try {
      const response = reviewResponse(db, id, { ...body, actor: body.actor ?? 'api' }, nowIso());
      return { response, queue_remaining: listReviewQueue(db).length };
    } catch (err) {
      return fail(reply, err);
    }
  });

  app.get('/api/source-inventory', async () => {
    const byKind = db
      .prepare('SELECT source_kind, provenance, COUNT(*) AS count FROM source_records GROUP BY source_kind, provenance')
      .all();
    const perProject = db
      .prepare(
        `SELECT project_id, source_kind, COUNT(*) AS count FROM source_records GROUP BY project_id, source_kind ORDER BY project_id`,
      )
      .all();
    const runs = db.prepare('SELECT id, started_at, as_of FROM import_runs ORDER BY id DESC LIMIT 5').all();
    return { as_of: currentAsOf(db), by_kind: byKind, per_project: perProject, recent_runs: runs };
  });

  app.get('/api/import-runs/latest', async () => {
    const row = db.prepare('SELECT * FROM import_runs ORDER BY id DESC LIMIT 1').get() as
      | { report_json: string }
      | undefined;
    if (!row) return { message: 'belum ada impor' };
    const issues = db.prepare('SELECT * FROM ingest_issues ORDER BY id').all();
    return { ...JSON.parse(row.report_json), issues };
  });

  app.post('/api/import', async (_req, reply) => {
    try {
      const hadData = (db.prepare('SELECT COUNT(*) AS c FROM projects').get() as { c: number }).c > 0;
      const before = hadData ? portfolioNow() : null;
      const report = runImport(db);
      const after = portfolioNow();
      const findings_impact = diffFindings(before, after);
      const issues_sync = syncIssues(db, after, report.finished_at);
      return { report, findings_impact, issues_sync, as_of: after.as_of };
    } catch (err) {
      return fail(reply, err);
    }
  });

  const distDir = path.join(REPO_ROOT, 'frontend', 'dist');
  if (fs.existsSync(distDir)) {
    app.register(fastifyStatic, { root: distDir, prefix: '/' });
  }

  return app;
}
