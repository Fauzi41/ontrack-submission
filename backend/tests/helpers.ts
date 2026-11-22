import type { ProjectFacts, ProjectRow, TypeRule, ValueRow } from '../src/interpret/types.js';

let seq = 0;

/** Satu nilai observasi. Referensi dibuat unik supaya pengelompokan berbasis
 *  bukti bersama tidak terjadi tanpa sengaja di test. */
export function value(metric: string, v: number | string | null, extra: Partial<ValueRow> = {}): ValueRow {
  seq += 1;
  return {
    record_id: seq,
    metric,
    unit: null,
    value_num: typeof v === 'number' ? v : null,
    value_text: typeof v === 'string' ? v : null,
    presence: v === null ? 'KNOWN_ABSENT' : 'PRESENT',
    workflow_state: null,
    observed_at: '2026-10-06T07:00:00',
    source_kind: 'PRODUCTION',
    source_ref_id: `REF-${seq}`,
    provenance: 'OPERATIONAL',
    record_type: null,
    ...extra,
  };
}

/** Baris yang datang dari laporan manusia, bukan dari sistem operasionalnya. */
export function master(metric: string, v: number, ref = 'MASTER-1'): ValueRow {
  return value(metric, v, { source_kind: 'MASTER', provenance: 'REPORTED', source_ref_id: ref });
}

export function facts(
  project: Partial<ProjectRow> = {},
  values: ValueRow[] = [],
  rule: Partial<TypeRule> = {},
  asOf = '2026-10-06T17:00:00',
): ProjectFacts {
  return {
    project: {
      project_id: 'PRJ-T',
      customer: 'Customer Uji',
      project_name: 'Proyek Uji',
      project_type: 'Archive Arrangement',
      pic: 'PIC',
      start_date: '2026-09-01',
      deadline: '2026-10-15',
      target: 1000,
      target_unit: 'pages',
      reported_actual: 900,
      reported_progress_pct: 90,
      reported_status: 'ON TRACK',
      ...project,
    },
    rule: { progress_basis: 'validated_quantity', rate_model: 'flow', expected_cadence_hours: 72, ...rule },
    values,
    updates: [],
    asOf,
  };
}
