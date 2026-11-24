import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  FileText,
  HelpCircle,
  Layers,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { useState } from 'react';
import type { ActivePersona, ProjectIntelligence } from '../types';
import { AttentionBadge, SourceLayerBadge, UncertaintyBadge } from './Badges';
import { DeadlineBreakdown } from './DeadlineBreakdown';
import { FollowUpPanel } from './FollowUpPanel';

interface ProjectDetailViewProps {
  project: ProjectIntelligence;
  persona: ActivePersona;
  onSwitchToDirector: () => void;
  onBack: () => void;
  onRefreshProject: () => Promise<void>;
}

export function ProjectDetailView({
  project,
  persona,
  onSwitchToDirector,
  onBack,
  onRefreshProject,
}: ProjectDetailViewProps) {
  const [timelineFilter, setTimelineFilter] = useState<'ALL' | 'OPERATIONAL_EVIDENCE' | 'REPORT_UPDATE'>('ALL');
  const [showRawJson, setShowRawJson] = useState<Record<string, boolean>>({});

  const { master, operational_summary: op, deadline_analysis: da } = project;
  const filteredTimeline = project.timeline.filter(
    (e) => timelineFilter === 'ALL' || e.layer === timelineFilter
  );

  return (
    <div className="space-y-6">
      {/* Top Breadcrumb & Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" /> Kembali ke Portfolio Overview
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <AttentionBadge level={project.attention_level} />
            <UncertaintyBadge level={project.uncertainty_level} />
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="font-mono text-xs font-bold text-slate-500">
              {master.project_id} • {master.project_type}
            </div>
            <h1 className="text-xl font-extrabold text-slate-900 mt-0.5">
              {master.project_name}
            </h1>
            <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
              <span>Customer: <strong>{master.customer}</strong></span>
              <span>PIC Master: <strong>{master.pic}</strong></span>
              <span>Periode: <strong className="font-mono">{master.start_date} → {master.deadline}</strong></span>
              <span>Target: <strong className="font-mono">{master.target.toLocaleString('en-US')} {master.target_unit}</strong></span>
            </div>
          </div>
          <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 max-w-md text-xs">
            <div className="font-bold text-slate-900">{project.key_verdict}</div>
            <p className="text-slate-600 mt-0.5">{project.executive_summary}</p>
          </div>
        </div>

        {/* 3-Layer Source Comparison Strip: Reported vs Operational vs Interpretation */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/70 space-y-1.5">
            <SourceLayerBadge kind="PROJECT_MASTER" />
            <div className="text-xs space-y-1 text-slate-700 pt-1">
              <div className="flex justify-between">
                <span>Reported Status:</span>
                <strong className="font-mono text-slate-900">{master.reported_status}</strong>
              </div>
              <div className="flex justify-between">
                <span>Reported Actual:</span>
                <strong className="font-mono text-slate-900">
                  {master.reported_actual.toLocaleString('en-US')} {master.target_unit}
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Reported Progress:</span>
                <strong className="font-mono text-slate-900">
                  {master.reported_progress_pct}% (hitung: {da.computed_reported_pct}%)
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Last Master Update:</span>
                <span className="font-mono text-[11px]">{master.last_reported_update_at}</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-teal-200 bg-teal-50/50 space-y-1.5">
            <SourceLayerBadge kind="PRODUCTION_EVIDENCE" />
            <div className="text-xs space-y-1 text-teal-950 pt-1">
              <div className="flex justify-between">
                <span>Operational Verified:</span>
                <strong className="font-mono">
                  {op.verified_quantity !== null
                    ? `${op.verified_quantity.toLocaleString('en-US')} ${master.target_unit} (${da.operational_verified_pct}%)`
                    : 'Tidak tersedia'}
                </strong>
              </div>
              {op.pending_quantity !== null && (
                <div className="flex justify-between">
                  <span>Pending Internal Check:</span>
                  <strong className="font-mono">
                    {op.pending_quantity} {master.target_unit}
                  </strong>
                </div>
              )}
              {op.quality_skipped_count !== null && (
                <div className="flex justify-between">
                  <span>Skipped (Missing Region):</span>
                  <strong className="font-mono text-rose-800">
                    {op.quality_skipped_count.toLocaleString('en-US')} ({op.quality_skip_rate_pct}%)
                  </strong>
                </div>
              )}
              {op.environment_status && (
                <div className="flex justify-between">
                  <span>Env ({op.environment_status.environment}):</span>
                  <strong className="font-mono text-rose-800">
                    {op.environment_status.connection_status}
                  </strong>
                </div>
              )}
              {op.scanners && (
                <div className="flex justify-between gap-2">
                  <span>Scanners:</span>
                  <strong className="font-mono text-right">
                    {op.scanners.units.map((u) => `${u.scanner_id}:${u.status}`).join(' • ')}
                  </strong>
                </div>
              )}
              {op.dms_status && (
                <div className="flex justify-between">
                  <span>DMS Monitor:</span>
                  <strong className="font-mono text-emerald-800">
                    {op.dms_status.application_status} ({op.dms_status.active_users_last_24h ?? 0} users/24h)
                  </strong>
                </div>
              )}
              <div className="flex justify-between">
                <span>Latest Telemetry:</span>
                <span className="font-mono text-[11px]">{op.latest_timestamp ?? '—'}</span>
              </div>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-amber-200 bg-amber-50/40 space-y-1.5">
            <SourceLayerBadge kind="INTERPRETATION" />
            <div className="text-xs space-y-1 text-slate-800 pt-1">
              <div className="flex justify-between">
                <span>Attention Level:</span>
                <strong className="font-mono">{project.attention_level} (score {project.attention_score})</strong>
              </div>
              <div className="flex justify-between">
                <span>Schedule Verdict:</span>
                <strong className="font-mono">{da.feasibility_verdict}</strong>
              </div>
              <div className="flex justify-between">
                <span>Signals / Unknowns:</span>
                <strong className="font-mono">
                  {project.signals.length} temuan / {project.unknowns.length} ketidakpastian
                </strong>
              </div>
              <div className="flex justify-between">
                <span>Data Age (Op / Upd):</span>
                <span className="font-mono text-[11px]">
                  {op.hours_since_last_operational !== null ? `${op.hours_since_last_operational}h` : '—'} /{' '}
                  {op.hours_since_last_update !== null ? `${op.hours_since_last_update}h` : '—'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Explainable Attention Signals + Explicit Unknowns (2 columns on large screens) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <section className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-slate-800" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Explainable Attention Signals ({project.signals.length})
              </h3>
              <p className="text-xs text-slate-500">
                Setiap penilaian diturunkan dari aturan generik dan ditautkan langsung ke ID sumber & timestamp.
              </p>
            </div>
          </div>
          <div className="p-5 space-y-3">
            {project.signals.length === 0 ? (
              <div className="p-5 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center gap-3 text-xs text-emerald-900">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <div>
                  <strong>Tidak ada sinyal perhatian aktif.</strong> Laporan proyek selaras dengan bukti operasional terbaru yang tersedia pada tanggal acuan ini.
                </div>
              </div>
            ) : (
              project.signals.map((sig) => (
                <div
                  key={sig.signal_id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AttentionBadge level={sig.severity} />
                      <span className="font-mono text-[11px] font-semibold text-slate-500">
                        {sig.rule_code}
                      </span>
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase">
                      {sig.category.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-slate-900">{sig.title}</h4>
                  <p className="text-xs text-slate-700 leading-relaxed">{sig.explanation}</p>

                  {(sig.reported_claim || sig.observed_reality) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                      {sig.reported_claim && (
                        <div className="p-2.5 rounded-lg bg-white border border-slate-200">
                          <div className="text-[10px] font-bold uppercase text-slate-400">
                            Klaim / Laporan
                          </div>
                          <div className="text-slate-800 font-medium mt-0.5">
                            {sig.reported_claim}
                          </div>
                        </div>
                      )}
                      {sig.observed_reality && (
                        <div className="p-2.5 rounded-lg bg-teal-50/60 border border-teal-200">
                          <div className="text-[10px] font-bold uppercase text-teal-700">
                            Observasi / Realitas Operasional
                          </div>
                          <div className="text-teal-950 font-medium mt-0.5">
                            {sig.observed_reality}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {sig.evidence_refs.length > 0 && (
                    <div className="pt-1">
                      <div className="text-[10px] font-bold uppercase text-slate-400 mb-1">
                        Traceable Provenance ({sig.evidence_refs.length} rujukan)
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {sig.evidence_refs.map((ref, idx) => (
                          <span
                            key={`${ref.ref_id}-${idx}`}
                            title={ref.excerpt || ref.source_label}
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono border ${
                              ref.source_kind === 'PRODUCTION_EVIDENCE'
                                ? 'bg-teal-50 text-teal-900 border-teal-200'
                                : ref.source_kind === 'PROJECT_UPDATE'
                                  ? 'bg-indigo-50 text-indigo-900 border-indigo-200'
                                  : 'bg-slate-100 text-slate-800 border-slate-300'
                            }`}
                          >
                            <strong>{ref.ref_id}</strong>
                            <span className="opacity-75">
                              • {ref.timestamp.slice(5, 16).replace('T', ' ')}
                            </span>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Explicit Unknowns & Unverified Conditions */}
        <section className="bg-white border border-purple-200 rounded-xl shadow-xs overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-purple-100 bg-purple-50/60 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-purple-800" />
            <div>
              <h3 className="text-sm font-bold text-purple-950">
                Ketidakpastian & Belum Terverifikasi ({project.unknowns.length})
              </h3>
              <p className="text-xs text-purple-800">
                Apa yang tidak dapat disimpulkan secara pasti dari data saat ini.
              </p>
            </div>
          </div>
          <div className="p-4 space-y-3 flex-1">
            {project.unknowns.length === 0 ? (
              <p className="text-xs text-slate-500">Tidak ada gap informasi signifikan.</p>
            ) : (
              project.unknowns.map((u, idx) => (
                <div
                  key={`${u.code}-${idx}`}
                  className="p-3 rounded-lg bg-purple-50/40 border border-purple-100 space-y-1 text-xs"
                >
                  <div className="font-bold text-purple-950 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-purple-700 shrink-0 mt-0.5" />
                    <span>{u.title}</span>
                  </div>
                  <p className="text-slate-700 leading-relaxed">{u.description}</p>
                  <div className="text-[11px] text-purple-900 font-medium pt-0.5">
                    Dampak: {u.impact}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>

      {/* Detailed Step-by-Step Deadline & Pace Calculation Breakdown */}
      <DeadlineBreakdown analysis={da} />

      {/* Follow-Up Workflow + Section 11 Evidence-Based Closure */}
      <FollowUpPanel
        projectId={project.project_id}
        defaultOwner={master.pic}
        persona={persona}
        onSwitchToDirector={onSwitchToDirector}
        signals={project.signals}
        timeline={project.timeline}
        followups={project.followups}
        onMutated={onRefreshProject}
      />

      {/* Unified Chronological Source & Evidence Timeline */}
      <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Layers className="w-5 h-5 text-slate-700" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Chronological Source & Operational Evidence Timeline ({filteredTimeline.length})
              </h3>
              <p className="text-xs text-slate-500">
                Memisahkan secara visual antara pesan laporan manusia (Project Updates) dan observasi sistem (Production Data).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { id: 'ALL', label: `Semua (${project.timeline.length})` },
              {
                id: 'OPERATIONAL_EVIDENCE',
                label: `Operational Evidence (${project.timeline.filter((e) => e.layer === 'OPERATIONAL_EVIDENCE').length})`,
              },
              {
                id: 'REPORT_UPDATE',
                label: `Report Updates (${project.timeline.filter((e) => e.layer === 'REPORT_UPDATE').length})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTimelineFilter(tab.id as typeof timelineFilter)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer ${
                  timelineFilter === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-slate-100">
          {filteredTimeline.map((evt) => {
            const isOp = evt.layer === 'OPERATIONAL_EVIDENCE';
            return (
              <div key={evt.event_id} className="p-4 hover:bg-slate-50/60 transition">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-3 max-w-3xl">
                    <div
                      className={`p-2 rounded-lg shrink-0 mt-0.5 ${
                        isOp ? 'bg-teal-50 text-teal-700' : 'bg-indigo-50 text-indigo-700'
                      }`}
                    >
                      {isOp ? <Server className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
                    </div>
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900">
                          {evt.event_id}
                        </span>
                        <SourceLayerBadge
                          kind={isOp ? 'PRODUCTION_EVIDENCE' : 'PROJECT_UPDATE'}
                        />
                        <span className="text-xs font-semibold text-slate-700">
                          {evt.source_type}
                          {evt.source_name !== evt.source_type ? ` — ${evt.source_name}` : ''}
                          {evt.record_type ? ` / ${evt.record_type}` : ''}
                        </span>
                      </div>
                      <p className="text-xs text-slate-800 leading-relaxed">{evt.summary}</p>
                      {showRawJson[evt.event_id] && (
                        <pre className="mt-2 p-3 rounded-lg bg-slate-900 text-slate-100 text-[11px] font-mono overflow-x-auto">
                          {JSON.stringify(evt.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>

                  <div className="text-right space-y-1 shrink-0">
                    <div className="inline-flex items-center gap-1 font-mono text-xs text-slate-600">
                      <Clock className="w-3.5 h-3.5" />
                      {evt.timestamp.replace('T', ' ')}
                    </div>
                    <div>
                      <button
                        type="button"
                        onClick={() =>
                          setShowRawJson((prev) => ({
                            ...prev,
                            [evt.event_id]: !prev[evt.event_id],
                          }))
                        }
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 underline cursor-pointer"
                      >
                        {showRawJson[evt.event_id] ? 'Sembunyikan Raw' : 'Inspeksi Payload'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
