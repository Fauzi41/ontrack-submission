import type {
  AttentionLevel,
  FollowUpActionStatus,
  FollowUpVerificationStatus,
  UncertaintyLevel,
} from '../types';

export function AttentionBadge({ level }: { level: AttentionLevel }) {
  const styles: Record<AttentionLevel, string> = {
    CRITICAL: 'bg-rose-100 text-rose-800 border-rose-300',
    HIGH: 'bg-amber-100 text-amber-900 border-amber-300',
    MEDIUM: 'bg-sky-100 text-sky-900 border-sky-300',
    LOW: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  };
  const labels: Record<AttentionLevel, string> = {
    CRITICAL: 'CRITICAL ATTENTION',
    HIGH: 'HIGH ATTENTION',
    MEDIUM: 'MONITOR / CLARIFY',
    LOW: 'VERIFIED OK',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border tracking-wide ${styles[level]}`}
    >
      {labels[level]}
    </span>
  );
}

export function UncertaintyBadge({ level }: { level: UncertaintyLevel }) {
  const styles: Record<UncertaintyLevel, string> = {
    HIGH: 'bg-purple-100 text-purple-900 border-purple-300',
    MODERATE: 'bg-slate-100 text-slate-700 border-slate-300',
    LOW: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${styles[level]}`}
    >
      Uncertainty: {level}
    </span>
  );
}

export function SourceLayerBadge({
  kind,
}: {
  kind: 'PROJECT_MASTER' | 'PROJECT_UPDATE' | 'PRODUCTION_EVIDENCE' | 'INTERPRETATION';
}) {
  const styles = {
    PROJECT_MASTER: 'bg-slate-100 text-slate-700 border-slate-300',
    PROJECT_UPDATE: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    PRODUCTION_EVIDENCE: 'bg-teal-50 text-teal-800 border-teal-300',
    INTERPRETATION: 'bg-amber-50 text-amber-900 border-amber-300',
  };
  const labels = {
    PROJECT_MASTER: 'REPORTED MASTER',
    PROJECT_UPDATE: 'FIELD / PM UPDATE',
    PRODUCTION_EVIDENCE: 'OPERATIONAL EVIDENCE',
    INTERPRETATION: 'SYSTEM INTERPRETATION',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider border ${styles[kind]}`}
    >
      {labels[kind]}
    </span>
  );
}

export function FollowUpStatusBadge({ status }: { status: FollowUpActionStatus }) {
  const styles: Record<FollowUpActionStatus, string> = {
    OPEN: 'bg-rose-50 text-rose-700 border-rose-200',
    IN_PROGRESS: 'bg-blue-50 text-blue-700 border-blue-200',
    RESOLVED: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    CANCELLED: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${styles[status]}`}
    >
      Action: {status.replace('_', ' ')}
    </span>
  );
}

export function VerificationStatusBadge({ status }: { status: FollowUpVerificationStatus }) {
  if (status === 'NOT_APPLICABLE') return null;
  if (status === 'VERIFIED_BY_EVIDENCE') {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border bg-teal-50 text-teal-800 border-teal-300">
        Issue: VERIFIED BY EVIDENCE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border bg-amber-100 text-amber-900 border-amber-400">
      Issue: UNVERIFIED (Awaiting Evidence)
    </span>
  );
}

export function FeasibilityBadge({ verdict }: { verdict: string }) {
  const styles: Record<string, string> = {
    COMPLETED_ON_TIME: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    COMPLETED_LATE: 'bg-amber-100 text-amber-800 border-amber-300',
    OVERDUE: 'bg-rose-200 text-rose-900 border-rose-400',
    MATHEMATICALLY_INFEASIBLE: 'bg-rose-100 text-rose-800 border-rose-300',
    AT_HIGH_RISK: 'bg-amber-100 text-amber-900 border-amber-300',
    PRESSURED: 'bg-sky-100 text-sky-900 border-sky-300',
    FEASIBLE_IF_CURRENT: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    INSUFFICIENT_DATA: 'bg-purple-100 text-purple-900 border-purple-300',
  };
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold border ${styles[verdict] ?? 'bg-slate-100 text-slate-700 border-slate-300'}`}
    >
      {verdict.replace(/_/g, ' ')}
    </span>
  );
}
