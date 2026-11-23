export type Severity = 'critical' | 'attention' | 'watch' | 'info';

export interface Evidence {
  ref_id: string;
  source_kind: string;
  provenance: string;
  observed_at: string | null;
  label: string;
}

export interface Finding {
  project_id: string;
  detector: string;
  fingerprint: string;
  severity: Severity;
  severity_final: Severity;
  confidence: 'high' | 'medium' | 'low';
  method: string;
  reason: string;
  unknowns: string[];
  evidence: Evidence[];
  action: string;
  owner: string;
  owner_reason: string;
  borderline: boolean;
  time_pressure: string;
  group_key: string | null;
}

export interface FindingGroup {
  group_key: string;
  title: string;
  severity: Severity;
  member_fingerprints: string[];
}

export interface Assessment {
  project_id: string;
  project_name: string;
  project_type: string;
  customer: string;
  pic: string | null;
  lifecycle: string;
  deadline: string | null;
  time_pressure: string;
  days_remaining: number | null;
  progress: {
    target: number | null;
    unit: string | null;
    reported: number | null;
    validated: number | null;
    pct_reported: number | null;
    pct_calculated: number | null;
    basis: string;
  };
  findings: Finding[];
  groups: FindingGroup[];
  top_severity: Severity;
  rank: number | null;
  tied: boolean;
  narrative: string;
  notes: string[];
}

export interface Portfolio {
  as_of: string;
  projects: Assessment[];
  counts: Partial<Record<Severity, number>>;
  issue_counts: Record<string, number>;
}

export interface Issue {
  id: number;
  project_id: string;
  detector_key: string;
  fingerprint: string;
  status: 'OPEN' | 'AWAITING_EVIDENCE' | 'VERIFIED_RESOLVED' | 'NOT_DETECTED';
  opened_at: string;
  last_evaluated_at: string;
  resolved_by_record: string | null;
  reopen_count: number;
}

export interface Followup {
  id: string;
  project_id: string;
  issue_id: number | null;
  fingerprint: string | null;
  title: string;
  description: string;
  owner: string;
  owner_kind: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResponseRow {
  id: number;
  project_id: string;
  fingerprint: string;
  actor: string;
  kind: 'ACKNOWLEDGED' | 'DISPUTED' | 'EXPLAINED';
  note: string;
  evidence_ref: string | null;
  needs_review: number;
  created_at: string;
}

export interface ProjectDetail extends Assessment {
  issues: Issue[];
  followups: Followup[];
  responses: ResponseRow[];
  as_of: string;
}

export interface ImportSummary {
  report: {
    inserted: number;
    updated: number;
    duplicates: number;
    rejected: number;
    late_arrivals: number;
    orphans: number;
    as_of: string | null;
    issues: Array<{ severity: string; code: string; message: string }>;
    impact: { added: string[]; removed: string[]; changed: Array<{ project_id: string; field: string; from: unknown; to: unknown }> };
  };
  findings_impact: { opened: Array<{ project_id: string; detector: string }>; gone: unknown[]; escalated: unknown[]; deescalated: unknown[] };
  issues_sync: { opened: number; reopened: number; noLongerDetected: number };
}

export interface Inventory {
  as_of: string | null;
  by_kind: Array<{ source_kind: string; provenance: string; count: number }>;
  per_project: Array<{ project_id: string; source_kind: string; count: number }>;
  recent_runs: Array<{ id: number; started_at: string; as_of: string | null }>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function parse<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new ApiError(res.status, String(body.error ?? res.status), String(body.message ?? res.statusText));
  }
  return body as T;
}

export const getPortfolio = (): Promise<Portfolio> => fetch('/api/portfolio').then((r) => parse<Portfolio>(r));

export const getProject = (id: string): Promise<ProjectDetail> =>
  fetch(`/api/projects/${id}`).then((r) => parse<ProjectDetail>(r));

export const getInventory = (): Promise<Inventory> => fetch('/api/source-inventory').then((r) => parse<Inventory>(r));

export const getIssues = (): Promise<{ issues: Issue[] }> => fetch('/api/issues').then((r) => parse<{ issues: Issue[] }>(r));

export const runImport = (): Promise<ImportSummary> =>
  fetch('/api/import', { method: 'POST' }).then((r) => parse<ImportSummary>(r));

export const setIssueStatus = (id: number, status: string, evidenceRef?: string): Promise<{ issue: Issue }> =>
  fetch(`/api/issues/${id}/status`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ status, evidence_ref: evidenceRef ?? null }),
  }).then((r) => parse<{ issue: Issue }>(r));

export const createFollowup = (
  projectId: string,
  body: { title: string; owner: string; due_date?: string | null; issue_id?: number | null; fingerprint?: string | null },
): Promise<{ followup: Followup }> =>
  fetch(`/api/projects/${projectId}/followups`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, actor: 'ui' }),
  }).then((r) => parse<{ followup: Followup }>(r));

export const updateFollowup = (
  id: string,
  body: { status?: string; note?: string },
): Promise<{ followup: Followup; events: Array<{ event_type: string; from_value: string | null; to_value: string | null; actor: string }>; note: string }> =>
  fetch(`/api/followups/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, actor: 'ui' }),
  }).then((r) => parse<{ followup: Followup; events: Array<{ event_type: string; from_value: string | null; to_value: string | null; actor: string }>; note: string }>(r));

export const addResponse = (
  projectId: string,
  fingerprint: string,
  body: { kind: string; note: string; evidence_ref?: string | null },
): Promise<{ response: ResponseRow }> =>
  fetch(`/api/projects/${projectId}/findings/${fingerprint}/responses`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, actor: 'ui' }),
  }).then((r) => parse<{ response: ResponseRow }>(r));

export const LABEL = {
  severity: { critical: 'Kritis', attention: 'Perhatian', watch: 'Pantau', info: 'Info' } as Record<string, string>,
  time: {
    OVERDUE: 'Lewat deadline',
    DUE_TODAY: 'Jatuh tempo hari ini',
    DUE_SOON: 'Segera',
    APPROACHING: 'Mendekat',
    DISTANT: 'Masih jauh',
    NONE: 'Tidak berlaku',
    UNKNOWN: 'Tidak diketahui',
  } as Record<string, string>,
  confidence: { high: 'tinggi', medium: 'sedang', low: 'rendah' } as Record<string, string>,
  owner: {
    PROJECT_MANAGER: 'Project manager',
    TECHNICAL_TEAM: 'Tim teknis',
    ACCOUNT: 'Account',
    VENDOR: 'Vendor',
    CUSTOMER: 'Pelanggan',
  } as Record<string, string>,
  issue: {
    OPEN: 'Terbuka',
    AWAITING_EVIDENCE: 'Menunggu bukti',
    VERIFIED_RESOLVED: 'Terverifikasi',
    NOT_DETECTED: 'Tidak terdeteksi lagi',
  } as Record<string, string>,
  basis: {
    validated_quantity: 'kuantitas tervalidasi',
    accepted_in_production: 'diterima di produksi',
  } as Record<string, string>,
  detector: {
    progress_gap: 'Progress dilaporkan melebihi bukti',
    schedule_risk: 'Laju tidak cukup untuk deadline',
    deadline_passed: 'Deadline lewat, belum selesai',
    stale_report: 'Laporan berhenti masuk',
    stale_evidence: 'Bukti operasional tidak diperbarui',
    blocked_dependency: 'Ketergantungan menghambat',
    capacity_degradation: 'Kapasitas menurun',
    quality_gap: 'Kualitas di bawah ambang',
    internal_inconsistency: 'Angka di satu baris tidak cocok',
    status_contradiction: 'Status bertentangan dengan bukti',
    progress_basis_conflict: 'Definisi progress tidak sesuai tipe proyek',
    source_conflict: 'Dua sumber berbeda angka',
    closure_evidence_missing: 'Klaim selesai tanpa bukti',
    verified_closure: 'Penutupan terbukti',
  } as Record<string, string>,
};

export const num = (v: number | null | undefined, digits = 0): string =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: digits }).format(v);

export const when = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }).format(d);
};

export const day = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
};
