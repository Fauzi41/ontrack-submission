export type AttentionLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type UncertaintyLevel = 'HIGH' | 'MODERATE' | 'LOW';
export type FollowUpActionStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CANCELLED';
export type FollowUpVerificationStatus =
  | 'NOT_APPLICABLE'
  | 'AWAITING_EVIDENCE'
  | 'VERIFIED_BY_EVIDENCE';

export interface ActivePersona {
  role: 'DIRECTOR' | 'PIC';
  name: string;
}

export interface ProjectMasterRecord {
  project_id: string;
  customer: string;
  project_name: string;
  project_type: string;
  pic: string;
  start_date: string;
  deadline: string;
  target: number;
  target_unit: string;
  reported_actual: number;
  reported_progress_pct: number;
  reported_status: string;
  last_reported_update_at: string;
}

export interface EvidenceRef {
  ref_id: string;
  source_kind: 'PROJECT_MASTER' | 'PROJECT_UPDATE' | 'PRODUCTION_EVIDENCE';
  source_label: string;
  timestamp: string;
  excerpt?: string;
}

export interface DeadlineCalculationStep {
  step: number;
  label: string;
  formula: string;
  substitution: string;
  result: string;
  note?: string;
}

export interface DeadlineAnalysis {
  as_of_date: string;
  start_date: string;
  deadline: string;
  is_completed: boolean;
  total_duration_days: number;
  elapsed_days: number;
  remaining_days: number;
  time_elapsed_pct: number;
  target: number;
  unit: string;
  reported_actual: number;
  reported_progress_pct: number;
  computed_reported_pct: number;
  operational_verified_actual: number | null;
  operational_verified_pct: number | null;
  operational_pending_actual: number | null;
  historical_daily_rate_reported: number | null;
  historical_daily_rate_operational: number | null;
  remaining_volume_reported: number;
  remaining_volume_operational: number | null;
  required_daily_rate_reported: number | null;
  required_daily_rate_operational: number | null;
  acceleration_factor_reported: number | null;
  acceleration_factor_operational: number | null;
  projected_days_needed_reported: number | null;
  projected_days_needed_operational: number | null;
  projected_completion_date_reported: string | null;
  projected_completion_date_operational: string | null;
  projected_slip_days_reported: number | null;
  projected_slip_days_operational: number | null;
  stated_capacity_per_day: number | null;
  stated_capacity_source_ref: string | null;
  projected_days_at_stated_capacity: number | null;
  projected_completion_at_stated_capacity: string | null;
  projected_slip_at_stated_capacity: number | null;
  feasibility_verdict: string;
  calculation_steps: DeadlineCalculationStep[];
}

export interface AttentionSignal {
  signal_id: string;
  rule_code: string;
  severity: AttentionLevel;
  category: string;
  title: string;
  explanation: string;
  reported_claim?: string;
  observed_reality?: string;
  evidence_refs: EvidenceRef[];
}

export interface UncertaintyItem {
  code: string;
  title: string;
  description: string;
  impact: string;
  evidence_refs: EvidenceRef[];
}

export interface OperationalSummary {
  latest_timestamp: string | null;
  hours_since_last_operational: number | null;
  hours_since_last_update: number | null;
  hours_since_last_master_report: number | null;
  verified_quantity: number | null;
  pending_quantity: number | null;
  verified_source_ref: EvidenceRef | null;
  pending_source_ref: EvidenceRef | null;
  quality_skipped_count: number | null;
  quality_skip_rate_pct: number | null;
  integration_developed: number | null;
  integration_configured: number | null;
  integration_production_tested: number | null;
  integration_target: number | null;
  environment_status: {
    environment: string;
    connection_status: string;
    last_successful_connection: string | null;
    source_ref: EvidenceRef;
  } | null;
  scanners: {
    latest_timestamp: string;
    source_ref: EvidenceRef;
    units: Array<{ scanner_id: string; status: string }>;
    previous_snapshot?: {
      timestamp: string;
      source_ref: EvidenceRef;
      units: Array<{ scanner_id: string; status: string }>;
    };
  } | null;
  dms_status: {
    application_status: string;
    deployment_status?: string;
    active_users_last_24h?: number;
    successful_logins_last_24h?: number;
    failed_logins_last_24h?: number;
    source_ref: EvidenceRef;
  } | null;
}

export interface TimelineEvent {
  event_id: string;
  timestamp: string;
  layer: 'REPORT_UPDATE' | 'OPERATIONAL_EVIDENCE';
  source_type: string;
  source_name: string;
  record_type?: string;
  summary: string;
  details: Record<string, unknown>;
}

export interface FollowUpHistoryEntry {
  history_id: number;
  followup_id: string;
  from_status: string | null;
  to_status: string;
  verification_status: FollowUpVerificationStatus;
  actor: string;
  note: string;
  evidence_ref: string | null;
  changed_at: string;
}

export interface FollowUpRecord {
  followup_id: string;
  project_id: string;
  title: string;
  description: string;
  owner: string;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
  action_status: FollowUpActionStatus;
  verification_status: FollowUpVerificationStatus;
  due_date: string | null;
  linked_signal_code: string | null;
  evidence_refs: string[];
  verification_evidence_ref: string | null;
  verification_note: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  post_resolution_evidence_available: boolean;
  eligible_verification_records: EvidenceRef[];
  history: FollowUpHistoryEntry[];
}

export interface ProjectIntelligence {
  project_id: string;
  master: ProjectMasterRecord;
  attention_level: AttentionLevel;
  attention_score: number;
  uncertainty_level: UncertaintyLevel;
  executive_summary: string;
  key_verdict: string;
  deadline_analysis: DeadlineAnalysis;
  operational_summary: OperationalSummary;
  signals: AttentionSignal[];
  unknowns: UncertaintyItem[];
  timeline: TimelineEvent[];
  followups: FollowUpRecord[];
  open_followup_count: number;
  resolved_unverified_followup_count: number;
}

export interface IngestionWarning {
  source_file: string;
  record_ref: string;
  field?: string;
  severity: 'ERROR' | 'WARNING' | 'INFO';
  code: string;
  message: string;
}

export interface IngestionRunSummary {
  run_id: string;
  trigger: 'STARTUP' | 'DISK_REFRESH' | 'API_INGEST';
  executed_at: string;
  masters_upserted: number;
  updates_inserted: number;
  updates_duplicate_skipped: number;
  updates_conflict_flagged: number;
  updates_historical_backfill: number;
  production_inserted: number;
  production_duplicate_skipped: number;
  production_conflict_flagged: number;
  production_historical_backfill: number;
  quarantined_count: number;
  warnings: IngestionWarning[];
}

export interface PortfolioOverview {
  as_of_date: string;
  generated_at: string;
  available_pics: string[];
  kpis: {
    total_projects: number;
    critical_attention: number;
    high_attention: number;
    medium_attention: number;
    low_or_verified: number;
    projects_with_discrepancy: number;
    projects_with_stale_data: number;
    projects_with_schedule_risk: number;
    open_followups: number;
    resolved_awaiting_evidence: number;
  };
  projects: ProjectIntelligence[];
  last_ingestion: IngestionRunSummary | null;
}
