import type { Database } from 'better-sqlite3';

export const RESPONSE_KINDS = ['ACKNOWLEDGED', 'DISPUTED', 'EXPLAINED'] as const;
export type ResponseKind = (typeof RESPONSE_KINDS)[number];

export class ResponseError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface ResponseRow {
  id: number;
  project_id: string;
  fingerprint: string;
  actor: string;
  kind: ResponseKind;
  note: string;
  evidence_ref: string | null;
  needs_review: number;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_decision: string | null;
  review_note: string | null;
  created_at: string;
}

export interface ReviewRow {
  id: number;
  project_id: string;
  project_name: string;
  fingerprint: string;
  actor: string;
  kind: ResponseKind;
  note: string;
  evidence_ref: string | null;
  created_at: string;
  issue_status: string | null;
}

/**
 * Antrean tinjauan: tanggapan manusia yang belum diputuskan. Urutannya
 * bantahan lebih dulu, karena itu yang menuntut keputusan.
 *
 * Detector dan severity tidak diambil dari tabel, karena temuan tidak disimpan:
 * keduanya dihitung saat permintaan dan ditempelkan oleh rute.
 */
export function listReviewQueue(db: Database): ReviewRow[] {
  return db
    .prepare(
      `SELECT r.id, r.project_id, p.project_name, r.fingerprint,
              r.actor, r.kind, r.note, r.evidence_ref, r.created_at, i.status AS issue_status
       FROM finding_responses r
       LEFT JOIN projects p ON p.project_id = r.project_id
       LEFT JOIN issues i ON i.project_id = r.project_id AND i.fingerprint = r.fingerprint
       WHERE r.needs_review = 1 AND r.reviewed_at IS NULL
       ORDER BY CASE r.kind WHEN 'DISPUTED' THEN 0 WHEN 'EXPLAINED' THEN 1 ELSE 2 END, r.created_at`,
    )
    .all() as ReviewRow[];
}

export const REVIEW_DECISIONS = ['UPHELD', 'DENIED'] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];

/**
 * Keputusan manusia atas sebuah tanggapan. Severity temuan tidak diubah di sini:
 * yang dicatat adalah penilaian manusia, bukan penulisan ulang keluaran mesin.
 */
export function reviewResponse(
  db: Database,
  id: number,
  input: { decision?: string; note?: string; actor?: string },
  now: string,
): ResponseRow {
  const existing = db.prepare('SELECT * FROM finding_responses WHERE id = ?').get(id) as ResponseRow | undefined;
  if (!existing) throw new ResponseError('REVIEW_NOT_FOUND', `Tanggapan ${id} tidak ada.`);
  if (existing.reviewed_at) {
    throw new ResponseError('ALREADY_REVIEWED', `Tanggapan ${id} sudah diputuskan pada ${existing.reviewed_at}.`);
  }
  if (!REVIEW_DECISIONS.includes(input.decision as ReviewDecision)) {
    throw new ResponseError('DECISION_INVALID', `Keputusan harus salah satu dari ${REVIEW_DECISIONS.join(', ')}.`);
  }
  const note = (input.note ?? '').trim();
  if (note.length < 3) throw new ResponseError('NOTE_REQUIRED', 'Keputusan tanpa alasan tidak bisa ditelusuri.');
  const actor = (input.actor ?? '').trim();
  if (!actor) throw new ResponseError('ACTOR_REQUIRED', 'Keputusan harus punya nama peninjau.');

  db.prepare(
    `UPDATE finding_responses
     SET needs_review = 0, reviewed_at = ?, reviewed_by = ?, review_decision = ?, review_note = ?
     WHERE id = ?`,
  ).run(now, actor, input.decision, note, id);

  return db.prepare('SELECT * FROM finding_responses WHERE id = ?').get(id) as ResponseRow;
}

export function listResponses(db: Database, projectId: string, fingerprint: string): ResponseRow[] {
  return db
    .prepare('SELECT * FROM finding_responses WHERE project_id = ? AND fingerprint = ? ORDER BY id')
    .all(projectId, fingerprint) as ResponseRow[];
}

export function addResponse(
  db: Database,
  projectId: string,
  fingerprint: string,
  input: { actor?: string; kind?: string; note?: string; evidence_ref?: string | null },
  now: string,
): ResponseRow {
  const actor = (input.actor ?? '').trim();
  if (!actor) throw new ResponseError('ACTOR_REQUIRED', 'Tanggapan harus punya nama pengirim.');
  if (!RESPONSE_KINDS.includes(input.kind as ResponseKind)) {
    throw new ResponseError('KIND_INVALID', `Jenis tanggapan harus salah satu dari ${RESPONSE_KINDS.join(', ')}.`);
  }
  const note = (input.note ?? '').trim();
  if (note.length < 3) {
    throw new ResponseError('NOTE_REQUIRED', 'Tanggapan tanpa alasan tidak bisa dinilai; tulis alasannya.');
  }
  if (input.evidence_ref) {
    const record = db.prepare('SELECT project_id FROM source_records WHERE source_ref_id = ?').get(input.evidence_ref);
    if (!record) throw new ResponseError('EVIDENCE_UNKNOWN', `Record ${input.evidence_ref} tidak ada di data sumber.`);
  }

  const info = db
    .prepare(
      `INSERT INTO finding_responses (project_id, fingerprint, actor, kind, note, evidence_ref, needs_review, created_at)
       VALUES (?,?,?,?,?,?,1,?)`,
    )
    .run(projectId, fingerprint, actor, input.kind, note, input.evidence_ref ?? null, now);

  return db.prepare('SELECT * FROM finding_responses WHERE id = ?').get(info.lastInsertRowid) as ResponseRow;
}
