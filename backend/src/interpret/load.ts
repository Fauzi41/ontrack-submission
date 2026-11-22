import type { Database } from 'better-sqlite3';
import type { ProjectFacts, ProjectRow, TypeRule, UpdateRow, ValueRow } from './types.js';

interface RawValue {
  record_id: number;
  metric: string;
  unit: string | null;
  value_num: number | null;
  value_text: string | null;
  presence: string;
  workflow_state: string | null;
  observed_at: string | null;
  source_kind: string;
  source_ref_id: string;
  provenance: string;
  record_type: string | null;
}

export function readAsOf(db: Database): string {
  const row = db.prepare('SELECT value FROM meta WHERE key = ?').get('as_of') as { value: string } | undefined;
  return row?.value ?? new Date().toISOString();
}

export function loadFacts(db: Database, asOf = readAsOf(db)): ProjectFacts[] {
  const projects = db
    .prepare(
      `SELECT project_id, customer, project_name, project_type, pic, start_date, deadline, target, target_unit,
              reported_actual, reported_progress_pct, reported_status
       FROM projects WHERE active = 1 ORDER BY project_id`,
    )
    .all() as ProjectRow[];

  const rules = new Map<string, TypeRule>();
  for (const r of db.prepare('SELECT project_type, progress_basis, rate_model, expected_cadence_hours FROM project_types').all() as Array<
    TypeRule & { project_type: string }
  >) {
    rules.set(r.project_type, r);
  }

  const valuesStmt = db.prepare(
    `SELECT v.record_id, v.metric, v.unit, v.value_num, v.value_text, v.presence, v.workflow_state, v.observed_at,
            r.source_kind, r.source_ref_id, r.provenance, r.record_type
     FROM observation_values v JOIN source_records r ON r.id = v.record_id
     WHERE v.project_id = ?`,
  );

  return projects.map((project) => {
    const rows = valuesStmt.all(project.project_id) as RawValue[];
    const values: ValueRow[] = rows.map((r) => ({
      record_id: r.record_id,
      metric: r.metric,
      unit: r.unit,
      value_num: r.value_num,
      value_text: r.value_text,
      presence: r.presence as ValueRow['presence'],
      workflow_state: r.workflow_state,
      observed_at: r.observed_at,
      source_kind: r.source_kind,
      source_ref_id: r.source_ref_id,
      provenance: r.provenance,
      record_type: r.record_type,
    }));

    const updates: UpdateRow[] = values
      .filter((v) => v.metric === 'message' && v.value_text)
      .map((v) => ({
        update_id: v.source_ref_id,
        ts: v.observed_at ?? '',
        source_type:
          values.find((x) => x.metric === 'source_type' && x.record_id === v.record_id)?.value_text ?? 'UNKNOWN',
        message: v.value_text ?? '',
      }))
      .sort((a, b) => a.ts.localeCompare(b.ts));

    const rule: TypeRule = rules.get(project.project_type) ?? {
      progress_basis: 'validated_quantity',
      rate_model: 'flow',
      expected_cadence_hours: 72,
    };

    return { project, rule, values, updates, asOf };
  });
}
