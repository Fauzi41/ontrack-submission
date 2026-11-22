import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { API_PORT, REPO_ROOT } from '../config';
import { openDb } from '../db/db';
import { ImportError, currentAsOf, runImport } from '../ingest/importer';

export function buildServer(dbPath?: string) {
  const db = openDb(dbPath);
  const app = Fastify({ logger: false });

  app.register(cors, { origin: true });

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
      return runImport(db);
    } catch (err) {
      if (err instanceof ImportError) {
        return reply.code(422).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  const distDir = path.join(REPO_ROOT, 'frontend', 'dist');
  if (fs.existsSync(distDir)) {
    app.register(fastifyStatic, { root: distDir, prefix: '/' });
  }

  return app;
}
