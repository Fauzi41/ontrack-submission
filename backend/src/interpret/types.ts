import type { Presence } from '../core/presence.js';

export type Severity = 'critical' | 'attention' | 'watch' | 'info';
export type Confidence = 'high' | 'medium' | 'low';
export type OwnerRole = 'PROJECT_MANAGER' | 'TECHNICAL_TEAM' | 'ACCOUNT' | 'VENDOR' | 'CUSTOMER';
export type TimePressure = 'OVERDUE' | 'DUE_TODAY' | 'DUE_SOON' | 'APPROACHING' | 'DISTANT' | 'NONE' | 'UNKNOWN';
export type RateModel = 'flow' | 'discrete';
export type ProgressBasis = 'validated_quantity' | 'accepted_in_production';

export interface ValueRow {
  record_id: number;
  metric: string;
  unit: string | null;
  value_num: number | null;
  value_text: string | null;
  presence: Presence;
  workflow_state: string | null;
  observed_at: string | null;
  source_kind: string;
  source_ref_id: string;
  provenance: string;
  record_type: string | null;
}

export interface UpdateRow {
  update_id: string;
  ts: string;
  source_type: string;
  message: string;
}

export interface ProjectRow {
  project_id: string;
  customer: string;
  project_name: string;
  project_type: string;
  pic: string | null;
  start_date: string | null;
  deadline: string | null;
  target: number | null;
  target_unit: string | null;
  reported_actual: number | null;
  reported_progress_pct: number | null;
  reported_status: string;
}

export interface TypeRule {
  progress_basis: ProgressBasis;
  rate_model: RateModel;
  expected_cadence_hours: number;
}

export interface ProjectFacts {
  project: ProjectRow;
  rule: TypeRule;
  values: ValueRow[];
  updates: UpdateRow[];
  asOf: string;
}

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
  confidence: Confidence;
  method: string;
  reason: string;
  unknowns: string[];
  evidence: Evidence[];
  action: string;
  owner: OwnerRole;
  owner_reason: string;
  borderline: boolean;
  time_pressure: TimePressure;
  group_key: string | null;
}

export interface ProjectAssessment {
  project_id: string;
  project_name: string;
  project_type: string;
  customer: string;
  pic: string | null;
  lifecycle: string;
  deadline: string | null;
  time_pressure: TimePressure;
  days_remaining: number | null;
  progress: {
    target: number | null;
    unit: string | null;
    reported: number | null;
    validated: number | null;
    pct_reported: number | null;
    pct_calculated: number | null;
    basis: ProgressBasis;
  };
  findings: Finding[];
  groups: FindingGroup[];
  top_severity: Severity;
  rank: number | null;
  tied: boolean;
  narrative: string;
  notes: string[];
}

export interface FindingGroup {
  group_key: string;
  title: string;
  severity: Severity;
  member_fingerprints: string[];
}

export interface Portfolio {
  as_of: string;
  projects: ProjectAssessment[];
  counts: Record<Severity, number>;
}

export const SEVERITY_ORDER: Record<Severity, number> = { critical: 3, attention: 2, watch: 1, info: 0 };
export const CONFIDENCE_ORDER: Record<Confidence, number> = { high: 2, medium: 1, low: 0 };
export const TIME_ORDER: Record<TimePressure, number> = {
  OVERDUE: 6,
  DUE_TODAY: 5,
  DUE_SOON: 4,
  APPROACHING: 3,
  DISTANT: 2,
  NONE: 1,
  UNKNOWN: 0,
};
