import type { Database } from 'better-sqlite3';
import type { Portfolio } from '../interpret/types.js';

export const ISSUE_STATUSES = ['OPEN', 'AWAITING_EVIDENCE', 'VERIFIED_RESOLVED', 'NOT_DETECTED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export class IssueError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface IssueRow {
  id: number;
  project_id: string;
  detector_key: string;
  fingerprint: string;
  status: IssueStatus;
  opened_at: string;
  last_evaluated_at: string;
  resolved_by_record: string | null;
  reopen_count: number;
}

export function getIssue(db: Database, id: number): IssueRow {
  const row = db.prepare('SELECT * FROM issues WHERE id = ?').get(id) as IssueRow | undefined;
  if (!row) throw new IssueError('ISSUE_NOT_FOUND', 'Isu itu tidak ada.');
  return row;
}

export function listIssues(db: Database, projectId: string): IssueRow[] {
  return db.prepare('SELECT * FROM issues WHERE project_id = ? ORDER BY id').all(projectId) as IssueRow[];
}

/**
 * Menyelaraskan tabel issues dengan hasil evaluasi terakhir.
 *
 * Temuan yang hilang tidak otomatis dianggap beres: statusnya NOT_DETECTED, artinya
 * mesin tidak lagi melihat gejalanya. Hanya manusia yang bisa menyatakan
 * VERIFIED_RESOLVED, dan itu butuh record bukti yang masuk setelah isu dibuka.
 */
export function syncIssues(
  db: Database,
  portfolio: Portfolio,
  now: string,
): { opened: number; reopened: number; noLongerDetected: number } {
  const upsert = db.prepare(`
    INSERT INTO issues (project_id, detector_key, fingerprint, status, opened_at, last_evaluated_at)
    VALUES (@project_id, @detector_key, @fingerprint, 'OPEN', @now, @now)
    ON CONFLICT (project_id, fingerprint) DO UPDATE SET
      last_evaluated_at = @now,
      detector_key = excluded.detector_key,
      status = CASE WHEN issues.status IN ('NOT_DETECTED','VERIFIED_RESOLVED') THEN 'OPEN' ELSE issues.status END,
      reopen_count = issues.reopen_count + CASE WHEN issues.status IN ('NOT_DETECTED','VERIFIED_RESOLVED') THEN 1 ELSE 0 END
  `);
  const markGone = db.prepare(
    `UPDATE issues SET status = 'NOT_DETECTED', last_evaluated_at = ?
     WHERE id = ? AND status NOT IN ('NOT_DETECTED','VERIFIED_RESOLVED')`,
  );

  const existing = db.prepare('SELECT * FROM issues').all() as IssueRow[];
  const known = new Map(existing.map((r) => [`${r.project_id}|${r.fingerprint}`, r]));
  const seen = new Set<string>();
  let opened = 0;
  let reopened = 0;
  let noLongerDetected = 0;

  db.transaction(() => {
    for (const project of portfolio.projects) {
      for (const finding of project.findings) {
        if (finding.severity_final === 'info') continue;
        const key = `${project.project_id}|${finding.fingerprint}`;
        seen.add(key);
        const prev = known.get(key);
        if (!prev) opened++;
        else if (prev.status === 'NOT_DETECTED' || prev.status === 'VERIFIED_RESOLVED') reopened++;
        upsert.run({
          project_id: project.project_id,
          detector_key: finding.detector,
          fingerprint: finding.fingerprint,
          now,
        });
      }
    }
    for (const row of existing) {
      if (seen.has(`${row.project_id}|${row.fingerprint}`)) continue;
      if (markGone.run(now, row.id).changes > 0) noLongerDetected++;
    }
  })();

  return { opened, reopened, noLongerDetected };
}

export function setIssueStatus(
  db: Database,
  id: number,
  status: IssueStatus,
  evidenceRef: string | null,
  now: string,
): IssueRow {
  const row = getIssue(db, id);

  if (!['OPEN', 'AWAITING_EVIDENCE', 'VERIFIED_RESOLVED'].includes(status)) {
    throw new IssueError(
      'STATUS_NOT_MANUAL',
      'NOT_DETECTED hanya diisi oleh mesin saat gejalanya hilang dari data, bukan oleh tangan.',
    );
  }

  if (status === 'VERIFIED_RESOLVED') {
    if (!evidenceRef) {
      throw new IssueError(
        'EVIDENCE_REQUIRED',
        'Isu tidak bisa ditutup tanpa bukti. Sertakan record sumber yang membuktikan perbaikannya.',
      );
    }
    const record = db
      .prepare('SELECT project_id, ingested_at FROM source_records WHERE source_ref_id = ?')
      .get(evidenceRef) as { project_id: string | null; ingested_at: string } | undefined;
    if (!record) throw new IssueError('EVIDENCE_UNKNOWN', `Record ${evidenceRef} tidak ada di data sumber.`);
    if (record.project_id !== row.project_id) {
      throw new IssueError('EVIDENCE_OTHER_PROJECT', `Record ${evidenceRef} milik proyek lain.`);
    }
    if (record.ingested_at < row.opened_at) {
      throw new IssueError(
        'EVIDENCE_STALE',
        `Record ${evidenceRef} sudah ada saat isu dibuka, jadi tidak bisa dipakai sebagai bukti perbaikan.`,
      );
    }
  }

  db.prepare('UPDATE issues SET status = ?, last_evaluated_at = ?, resolved_by_record = ? WHERE id = ?').run(
    status,
    now,
    status === 'VERIFIED_RESOLVED' ? evidenceRef : null,
    id,
  );
  return getIssue(db, id);
}
