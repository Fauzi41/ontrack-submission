import type { Evidence, ProjectFacts, TimePressure, ValueRow } from './types.js';

const DAY = 86_400_000;

/** Semua timestamp di dataset tidak memakai zona waktu; diperlakukan sebagai UTC
 *  supaya selisih hari tidak bergeser mengikuti zona mesin yang menjalankan. */
export function parseTs(ts: string | null): number | null {
  if (!ts) return null;
  const iso = /T\d{2}:\d{2}/.test(ts) ? ts : `${ts}T00:00:00`;
  const ms = Date.parse(`${iso}Z`.replace(/Z+$/, 'Z'));
  return Number.isNaN(ms) ? null : ms;
}

/** Deadline dibaca sebagai akhir hari, bukan pukul 00:00. Tanpa ini PRJ-001
 *  terlihat terlambat sehari padahal masih punya 8 hari penuh. */
export function endOfDay(dateOnly: string | null): number | null {
  if (!dateOnly) return null;
  const ms = parseTs(`${dateOnly.slice(0, 10)}T23:59:59`);
  return ms;
}

const NUM = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
export const fmt = (n: number | null): string => (n === null ? '-' : NUM.format(n));

const VALIDATED_METRIC: Record<string, string> = {
  ML: 'verified_quantity',
  pages: 'pages_processed_total',
  boxes: 'processed_boxes',
  records: 'records_verified',
  endpoints: 'production_tested_endpoints',
};

export const UNIT_NOUN: Record<string, string> = {
  ML: 'meter lari',
  pages: 'halaman',
  boxes: 'box',
  records: 'record',
  endpoints: 'endpoint',
  system: 'sistem',
};

export interface Ctx {
  facts: ProjectFacts;
  lifecycle: string;
  latest: (metric: string) => ValueRow | undefined;
  all: (metric: string) => ValueRow[];
  num: (metric: string) => number | null;
  masterNum: (metric: string) => number | null;
  text: (metric: string) => string | null;
  validatedMetricName: () => string;
  lastOperational: ValueRow | undefined;
  reported: number | null;
  validated: number | null;
  pending: number | null;
  elapsedDays: number | null;
  remainingDays: number | null;
  overdueDays: number | null;
  hoursSinceReport: number | null;
  hoursSinceEvidence: number | null;
  timePressure: TimePressure;
  ev: (v: ValueRow | undefined, label: string) => Evidence;
}

export function buildContext(facts: ProjectFacts): Ctx {
  const { project, values, asOf } = facts;
  const asOfMs = parseTs(asOf) ?? 0;

  const byMetric = new Map<string, ValueRow[]>();
  for (const v of values) {
    const list = byMetric.get(v.metric);
    if (list) list.push(v);
    else byMetric.set(v.metric, [v]);
  }
  for (const list of byMetric.values()) {
    list.sort((a, b) => (parseTs(a.observed_at) ?? 0) - (parseTs(b.observed_at) ?? 0) || a.record_id - b.record_id);
  }

  const all = (metric: string): ValueRow[] => byMetric.get(metric) ?? [];
  const latest = (metric: string): ValueRow | undefined => all(metric).at(-1);
  const num = (metric: string): number | null => latest(metric)?.value_num ?? null;
  const masterNum = (metric: string): number | null =>
    all(metric).filter((v) => v.source_kind === 'MASTER').at(-1)?.value_num ?? null;
  const text = (metric: string): string | null => latest(metric)?.value_text ?? null;

  const reported = masterNum('reported_actual') ?? num('reported_actual') ?? project.reported_actual;
  const unit = project.target_unit ?? '';
  const validatedMetric = VALIDATED_METRIC[unit];
  const validated = validatedMetric ? num(validatedMetric) : null;
  const pending = unit === 'ML' ? num('pending_internal_check_quantity') : null;

  const startMs = parseTs(project.start_date);
  const deadlineMs = endOfDay(project.deadline);
  const elapsedDays = startMs ? Math.max(0, (asOfMs - startMs) / DAY) : null;
  const remainingRaw = deadlineMs === null ? null : (deadlineMs - asOfMs) / DAY;

  const lifecycle = project.reported_status.toUpperCase();
  const finished = lifecycle === 'COMPLETED' || lifecycle === 'CLOSED' || lifecycle === 'DELIVERED';

  let timePressure: TimePressure = 'UNKNOWN';
  if (finished) timePressure = 'NONE';
  else if (remainingRaw === null) timePressure = 'UNKNOWN';
  else if (remainingRaw < 0) timePressure = 'OVERDUE';
  else if (remainingRaw < 1) timePressure = 'DUE_TODAY';
  else if (remainingRaw <= 3) timePressure = 'DUE_SOON';
  else if (remainingRaw <= 10) timePressure = 'APPROACHING';
  else timePressure = 'DISTANT';

  const lastReportMs = Math.max(
    ...values.filter((v) => v.provenance === 'REPORTED').map((v) => parseTs(v.observed_at) ?? 0),
  );
  const lastEvidenceMs = Math.max(
    ...values.filter((v) => v.provenance === 'OPERATIONAL').map((v) => parseTs(v.observed_at) ?? 0),
  );

  const ev = (v: ValueRow | undefined, label: string): Evidence => ({
    ref_id: v?.source_ref_id ?? '-',
    source_kind: v?.source_kind ?? 'UNKNOWN',
    provenance: v?.provenance ?? 'UNKNOWN',
    observed_at: v?.observed_at ?? null,
    label,
  });

  return {
    facts,
    lifecycle,
    latest,
    all,
    num,
    masterNum,
    text,
    validatedMetricName: () => validatedMetric ?? 'reported_actual',
    lastOperational: values
      .filter((v) => v.provenance === 'OPERATIONAL')
      .sort((a, b) => (parseTs(b.observed_at) ?? 0) - (parseTs(a.observed_at) ?? 0))
      .at(0),
    reported,
    validated,
    pending,
    elapsedDays,
    remainingDays: remainingRaw,
    overdueDays: !finished && remainingRaw !== null && remainingRaw < 0 ? -remainingRaw : null,
    hoursSinceReport: Number.isFinite(lastReportMs) && lastReportMs > 0 ? (asOfMs - lastReportMs) / 3_600_000 : null,
    hoursSinceEvidence:
      Number.isFinite(lastEvidenceMs) && lastEvidenceMs > 0 ? (asOfMs - lastEvidenceMs) / 3_600_000 : null,
    timePressure,
    ev,
  };
}
