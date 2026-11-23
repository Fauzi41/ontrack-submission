import { randomUUID } from 'node:crypto';
import type { Database } from 'better-sqlite3';

export const FOLLOWUP_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

export class FollowupError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface FollowupRow {
  id: string;
  project_id: string;
  issue_id: number | null;
  fingerprint: string | null;
  title: string;
  description: string;
  owner: string;
  owner_kind: string;
  status: FollowupStatus;
  due_date: string | null;
  evidence_json: string;
  created_at: string;
  updated_at: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface CreateFollowupInput {
  title?: string;
  description?: string;
  owner?: string;
  owner_kind?: string;
  due_date?: string | null;
  issue_id?: number | null;
  fingerprint?: string | null;
}

export function listFollowups(db: Database, projectId: string): FollowupRow[] {
  return db
    .prepare('SELECT * FROM followups WHERE project_id = ? ORDER BY created_at, id')
    .all(projectId) as FollowupRow[];
}

export function getFollowup(db: Database, id: string): FollowupRow {
  const row = db.prepare('SELECT * FROM followups WHERE id = ?').get(id) as FollowupRow | undefined;
  if (!row) throw new FollowupError('FOLLOWUP_NOT_FOUND', 'Follow-up itu tidak ada.');
  return row;
}

function logEvent(
  db: Database,
  followupId: string,
  at: string,
  actor: string,
  type: string,
  from: string | null,
  to: string | null,
  note: string | null,
): void {
  db.prepare(
    'INSERT INTO followup_events (followup_id, at, actor, event_type, from_value, to_value, note) VALUES (?,?,?,?,?,?,?)',
  ).run(followupId, at, actor, type, from, to, note);
}

export function createFollowup(
  db: Database,
  projectId: string,
  input: CreateFollowupInput,
  actor: string,
  now: string,
): FollowupRow {
  const project = db.prepare('SELECT project_id FROM projects WHERE project_id = ?').get(projectId);
  if (!project) throw new FollowupError('PROJECT_NOT_FOUND', `Proyek ${projectId} tidak ada.`);

  const title = (input.title ?? '').trim();
  if (title.length < 4) throw new FollowupError('TITLE_REQUIRED', 'Judul follow-up minimal 4 karakter.');
  const owner = (input.owner ?? '').trim();
  if (!owner) throw new FollowupError('OWNER_REQUIRED', 'Follow-up harus punya pemilik yang bisa ditagih.');
  if (input.due_date && !DATE_RE.test(input.due_date)) {
    throw new FollowupError('DUE_DATE_FORMAT', 'Tanggal jatuh tempo memakai format YYYY-MM-DD.');
  }

  const id = `FU-${randomUUID().slice(0, 8)}`;
  db.transaction(() => {
    db.prepare(
      `INSERT INTO followups (id, project_id, issue_id, fingerprint, title, description, owner, owner_kind, status, due_date, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?, 'OPEN', ?,?,?)`,
    ).run(
      id,
      projectId,
      input.issue_id ?? null,
      input.fingerprint ?? null,
      title,
      input.description ?? '',
      owner,
      input.owner_kind ?? 'internal',
      input.due_date ?? null,
      now,
      now,
    );
    logEvent(db, id, now, actor, 'CREATED', null, 'OPEN', title);
  })();

  return getFollowup(db, id);
}

export interface UpdateFollowupInput {
  status?: string;
  owner?: string;
  due_date?: string | null;
  note?: string;
}

export function updateFollowup(
  db: Database,
  id: string,
  input: UpdateFollowupInput,
  actor: string,
  now: string,
): FollowupRow {
  const before = getFollowup(db, id);

  if (input.status && !FOLLOWUP_STATUSES.includes(input.status as FollowupStatus)) {
    throw new FollowupError('BAD_STATUS', `Status harus salah satu dari ${FOLLOWUP_STATUSES.join(', ')}.`);
  }
  if (input.owner !== undefined && !input.owner.trim()) {
    throw new FollowupError('OWNER_REQUIRED', 'Follow-up harus punya pemilik.');
  }
  if (input.due_date && !DATE_RE.test(input.due_date)) {
    throw new FollowupError('DUE_DATE_FORMAT', 'Tanggal jatuh tempo memakai format YYYY-MM-DD.');
  }

  const next = {
    status: (input.status as FollowupStatus | undefined) ?? before.status,
    owner: input.owner?.trim() ?? before.owner,
    due_date: input.due_date === undefined ? before.due_date : input.due_date,
  };

  db.transaction(() => {
    db.prepare('UPDATE followups SET status = ?, owner = ?, due_date = ?, updated_at = ? WHERE id = ?').run(
      next.status,
      next.owner,
      next.due_date,
      now,
      id,
    );
    if (next.status !== before.status) {
      logEvent(db, id, now, actor, 'STATUS_CHANGED', before.status, next.status, input.note ?? null);
    }
    if (next.owner !== before.owner) {
      logEvent(db, id, now, actor, 'REASSIGNED', before.owner, next.owner, input.note ?? null);
    }
    if (input.note && next.status === before.status && next.owner === before.owner) {
      logEvent(db, id, now, actor, 'NOTE', null, null, input.note);
    }
  })();

  return getFollowup(db, id);
}

export function listEvents(db: Database, followupId: string) {
  return db.prepare('SELECT * FROM followup_events WHERE followup_id = ? ORDER BY id').all(followupId);
}
