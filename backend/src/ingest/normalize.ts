import { Presence, parseNumber, presenceOf } from '../core/presence';

export type SourceKind = 'MASTER' | 'UPDATE' | 'PRODUCTION';
export type Provenance = 'REPORTED' | 'OPERATIONAL';

export interface RecordInput {
  project_id: string;
  source_kind: SourceKind;
  provenance: Provenance;
  source_ref_id: string;
  source_system: string | null;
  source_name: string | null;
  record_type: string | null;
  observed_at: string | null;
  raw_json: string;
}

export interface ValueInput {
  metric: string;
  unit: string | null;
  value_num: number | null;
  value_text: string | null;
  presence: Presence;
  workflow_state: string | null;
  observed_at: string | null;
}

export interface ProjectInput {
  project_id: string;
  customer: string | null;
  project_name: string | null;
  project_type: string | null;
  pic: string | null;
  start_date: string | null;
  deadline: string | null;
  target: number | null;
  target_unit: string | null;
  reported_actual: number | null;
  reported_progress_pct: number | null;
  reported_status: string | null;
  last_reported_update_at: string | null;
}

export interface Normalized {
  record: RecordInput;
  values: ValueInput[];
  project?: ProjectInput;
}

export interface NormalizeIssue {
  severity: 'ERROR' | 'WARN' | 'INFO';
  code: string;
  message: string;
  source_ref_id?: string;
}

export interface NormalizeResult {
  ok: boolean;
  normalized?: Normalized;
  issues: NormalizeIssue[];
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function nz(v: string | null | undefined): string | null {
  if (v === null || v === undefined) return null;
  const t = String(v).trim();
  return t === '' ? null : t;
}

/** Baris master -> project + nilai yang dapat dibandingkan. */
export function normalizeMasterRow(row: Record<string, string>, ingestedAt: string): NormalizeResult {
  const issues: NormalizeIssue[] = [];
  const projectId = nz(row['project_id']);
  if (!projectId) {
    return { ok: false, issues: [{ severity: 'ERROR', code: 'MISSING_PROJECT_ID', message: 'baris master tanpa project_id' }] };
  }

  const target = parseNumber(row['target']);
  const actual = parseNumber(row['reported_actual']);
  const pct = parseNumber(row['reported_progress_pct']);
  for (const [field, parsed] of [
    ['target', target],
    ['reported_actual', actual],
    ['reported_progress_pct', pct],
  ] as const) {
    if (parsed.issue) issues.push({ severity: 'WARN', code: 'UNREADABLE_NUMBER', message: `${field}: ${parsed.issue}`, source_ref_id: projectId });
  }

  const deadline = nz(row['deadline']);
  if (deadline && !DATE_RE.test(deadline)) {
    issues.push({ severity: 'WARN', code: 'BAD_DATE_FORMAT', message: `deadline tidak sesuai YYYY-MM-DD: "${deadline}"`, source_ref_id: projectId });
  }
  const lastUpdate = nz(row['last_reported_update_at']);
  if (lastUpdate && !DATETIME_RE.test(lastUpdate)) {
    issues.push({ severity: 'WARN', code: 'BAD_DATETIME_FORMAT', message: `last_reported_update_at tidak sesuai format: "${lastUpdate}"`, source_ref_id: projectId });
  }

  const unit = nz(row['target_unit']);
  const status = nz(row['reported_status']);
  const observedAt = lastUpdate;

  const values: ValueInput[] = [
    { metric: 'target', unit, value_num: target.value, value_text: null, presence: target.presence, workflow_state: null, observed_at: observedAt },
    { metric: 'reported_actual', unit, value_num: actual.value, value_text: null, presence: actual.presence, workflow_state: null, observed_at: observedAt },
    { metric: 'reported_progress_pct', unit: 'pct', value_num: pct.value, value_text: null, presence: pct.presence, workflow_state: null, observed_at: observedAt },
    { metric: 'reported_status', unit: null, value_num: null, value_text: status, presence: presenceOf(status), workflow_state: null, observed_at: observedAt },
  ];

  return {
    ok: true,
    issues,
    normalized: {
      record: {
        project_id: projectId,
        source_kind: 'MASTER',
        provenance: 'REPORTED',
        source_ref_id: projectId,
        source_system: 'project_master',
        source_name: 'Project Master',
        record_type: 'project_master',
        observed_at: observedAt,
        raw_json: JSON.stringify(row),
      },
      values,
      project: {
        project_id: projectId,
        customer: nz(row['customer']),
        project_name: nz(row['project_name']),
        project_type: nz(row['project_type']),
        pic: nz(row['pic']),
        start_date: nz(row['start_date']),
        deadline,
        target: target.value,
        target_unit: unit,
        reported_actual: actual.value,
        reported_progress_pct: pct.value,
        reported_status: status,
        last_reported_update_at: observedAt,
      },
    },
  };
}

/** Update lapangan -> laporan manusia (REPORTED), bukan bukti operasional. */
export function normalizeUpdateRow(row: Record<string, string>, ingestedAt: string): NormalizeResult {
  const updateId = nz(row['update_id']);
  const projectId = nz(row['project_id']);
  if (!updateId || !projectId) {
    return {
      ok: false,
      issues: [{ severity: 'ERROR', code: 'MISSING_KEY', message: 'update tanpa update_id atau project_id', source_ref_id: updateId ?? undefined }],
    };
  }
  const ts = nz(row['timestamp']);
  const issues: NormalizeIssue[] = [];
  if (ts && !DATETIME_RE.test(ts)) {
    issues.push({ severity: 'WARN', code: 'BAD_DATETIME_FORMAT', message: `timestamp update tidak sesuai format: "${ts}"`, source_ref_id: updateId });
  }
  const sourceType = nz(row['source_type']);
  const message = nz(row['message']);

  return {
    ok: true,
    issues,
    normalized: {
      record: {
        project_id: projectId,
        source_kind: 'UPDATE',
        provenance: 'REPORTED',
        source_ref_id: updateId,
        source_system: sourceType,
        source_name: nz(row['source_name']),
        record_type: 'project_update',
        observed_at: ts,
        raw_json: JSON.stringify(row),
      },
      values: [
        { metric: 'message', unit: null, value_num: null, value_text: message, presence: presenceOf(message), workflow_state: null, observed_at: ts },
        { metric: 'source_type', unit: null, value_num: null, value_text: sourceType, presence: presenceOf(sourceType), workflow_state: null, observed_at: ts },
      ],
    },
  };
}

const IDENTITY_KEYS = new Set(['source_record_id', 'project_id', 'source_system', 'record_type', 'timestamp']);

/**
 * Record produksi -> observasi OPERATIONAL. Ekstraksi field bersifat generik:
 * field baru pada dataset berikutnya tetap terbaca tanpa aturan per proyek.
 */
export function normalizeProductionRecord(rec: Record<string, unknown>, ingestedAt: string): NormalizeResult {
  const refId = nz(rec['source_record_id'] as string | undefined);
  const projectId = nz(rec['project_id'] as string | undefined);
  if (!refId || !projectId) {
    return {
      ok: false,
      issues: [{ severity: 'ERROR', code: 'MISSING_KEY', message: 'record produksi tanpa source_record_id atau project_id', source_ref_id: refId ?? undefined }],
    };
  }
  const ts = nz(rec['timestamp'] as string | undefined);
  const unit = nz(rec['unit'] as string | undefined);
  const recordType = nz(rec['record_type'] as string | undefined);
  const workflowState = nz(rec['workflow_state'] as string | undefined);

  const values: ValueInput[] = [];
  for (const [key, raw] of Object.entries(rec)) {
    if (IDENTITY_KEYS.has(key) || key === 'unit' || key === 'workflow_state') continue;
    if (raw !== null && typeof raw === 'object') {
      values.push({
        metric: key,
        unit: null,
        value_num: null,
        value_text: JSON.stringify(raw),
        presence: 'PRESENT',
        workflow_state: workflowState,
        observed_at: ts,
      });
    } else if (typeof raw === 'number') {
      values.push({ metric: key, unit, value_num: raw, value_text: null, presence: 'PRESENT', workflow_state: workflowState, observed_at: ts });
    } else if (raw === null) {
      // null = field ada, nilai tidak tercatat -> KNOWN_ABSENT (bukti, bukan ketiadaan data)
      values.push({ metric: key, unit, value_num: null, value_text: null, presence: 'KNOWN_ABSENT', workflow_state: workflowState, observed_at: ts });
    } else if (typeof raw === 'string') {
      const num = parseNumber(raw);
      // string numerik tetap disimpan sebagai teks; angka hanya untuk field numerik
      values.push({ metric: key, unit, value_num: null, value_text: raw, presence: presenceOf(raw), workflow_state: workflowState, observed_at: ts });
      void num;
    }
  }

  return {
    ok: true,
    issues: [],
    normalized: {
      record: {
        project_id: projectId,
        source_kind: 'PRODUCTION',
        provenance: 'OPERATIONAL',
        source_ref_id: refId,
        source_system: nz(rec['source_system'] as string | undefined),
        source_name: null,
        record_type: recordType,
        observed_at: ts,
        raw_json: JSON.stringify(rec),
      },
      values,
    },
  };
}
