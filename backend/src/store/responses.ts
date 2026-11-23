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
  created_at: string;
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
