import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Calendar,
  CheckCircle2,
  ClipboardList,
  Clock,
  Database,
  Edit3,
  HelpCircle,
  RotateCcw,
  Search,
  UserCheck,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { ActivePersona, AttentionLevel, PortfolioOverview, ProjectIntelligence } from '../types';
import { AttentionBadge, FeasibilityBadge, UncertaintyBadge } from './Badges';

interface PortfolioViewProps {
  portfolio: PortfolioOverview;
  persona: ActivePersona;
  resetting: boolean;
  onSwitchToDirector: () => void;
  onSelectProject: (projectId: string) => void;
  onOpenDataManager: () => void;
  onQuickReset: () => void;
  onOpenIngest: () => void;
}

export function PortfolioView({
  portfolio,
  persona,
  resetting,
  onSwitchToDirector,
  onSelectProject,
  onOpenDataManager,
  onQuickReset,
  onOpenIngest,
}: PortfolioViewProps) {
  const [filter, setFilter] = useState<'ALL' | 'ACTION_NEEDED' | 'DISCREPANCY' | 'STALE' | 'OK'>(
    'ALL'
  );
  const [query, setQuery] = useState('');

  useEffect(() => {
    setFilter('ALL');
    setQuery('');
  }, [persona.role, persona.name]);

  // Portfolio projects and KPIs are already strictly scoped by backend according to persona
  const scopedProjects =
    persona.role === 'PIC'
      ? portfolio.projects.filter(
          (p) => p.master.pic.toLowerCase() === persona.name.toLowerCase()
        )
      : portfolio.projects;

  const kpis = {
    total_projects: scopedProjects.length,
    critical_attention: scopedProjects.filter((p) => p.attention_level === 'CRITICAL').length,
    high_attention: scopedProjects.filter((p) => p.attention_level === 'HIGH').length,
    low_or_verified: scopedProjects.filter((p) => p.attention_level === 'LOW').length,
    projects_with_discrepancy: scopedProjects.filter((p) =>
      p.signals.some((s) =>
        [
          'REPORT_INCONSISTENCY',
          'SOURCE_DISCREPANCY',
          'WORKFLOW_STATE_GAP',
          'VALIDATION_GAP',
        ].includes(s.category)
      )
    ).length,
    projects_with_stale_data: scopedProjects.filter((p) =>
      p.signals.some((s) => s.category === 'DATA_STALENESS')
    ).length,
    projects_with_schedule_risk: scopedProjects.filter((p) =>
      p.signals.some((s) => s.category === 'SCHEDULE_FEASIBILITY')
    ).length,
    open_followups: scopedProjects.reduce((sum, p) => sum + p.open_followup_count, 0),
    resolved_awaiting_evidence: scopedProjects.reduce(
      (sum, p) => sum + p.resolved_unverified_followup_count,
      0
    ),
  };

  const filtered = scopedProjects.filter((p) => {
    const matchesQuery =
      !query.trim() ||
      `${p.project_id} ${p.master.project_name} ${p.master.customer} ${p.master.pic} ${p.master.project_type}`
        .toLowerCase()
        .includes(query.toLowerCase());
    if (!matchesQuery) return false;

    if (filter === 'ACTION_NEEDED')
      return p.attention_level === 'CRITICAL' || p.attention_level === 'HIGH';
    if (filter === 'DISCREPANCY')
      return p.signals.some((s) =>
        [
          'REPORT_INCONSISTENCY',
          'SOURCE_DISCREPANCY',
          'WORKFLOW_STATE_GAP',
          'VALIDATION_GAP',
        ].includes(s.category)
      );
    if (filter === 'STALE') return p.signals.some((s) => s.category === 'DATA_STALENESS');
    if (filter === 'OK') return p.attention_level === 'LOW';
    return true;
  });

  const borderAccent: Record<AttentionLevel, string> = {
    CRITICAL: 'border-l-4 border-l-rose-600',
    HIGH: 'border-l-4 border-l-amber-500',
    MEDIUM: 'border-l-4 border-l-sky-500',
    LOW: 'border-l-4 border-l-emerald-500',
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Action Toolbar (moved out of header for a clean top bar) */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-extrabold text-slate-900">
            {persona.role === 'PIC'
              ? `Workspace Proyek — PIC ${persona.name}`
              : 'Portfolio Overview — Management Control'}
          </h1>
          <p className="text-xs text-slate-500">
            {persona.role === 'PIC'
              ? `Menampilkan khusus ${kpis.total_projects} proyek milik ${persona.name}.`
              : 'Ringkasan kondisi operasional, perbandingan klaim laporan vs bukti sistem, dan prioritas perhatian.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpenDataManager}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-900 border border-teal-200 hover:bg-teal-100 cursor-pointer transition"
          >
            <Edit3 className="w-3.5 h-3.5" />
            Kelola Data
          </button>

          <button
            type="button"
            disabled={resetting}
            onClick={onQuickReset}
            title="Kembalikan data ke kondisi awal dataset asli (bukan kosong)"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-50 text-amber-900 border border-amber-300 hover:bg-amber-100 disabled:opacity-50 cursor-pointer transition"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${resetting ? 'animate-spin' : ''}`} />
            {persona.role === 'PIC' ? 'Reset Proyek Saya' : 'Reset Data Awal'}
          </button>

          {persona.role === 'DIRECTOR' && (
            <button
              type="button"
              onClick={onOpenIngest}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer transition"
            >
              <Database className="w-3.5 h-3.5" />
              CSV/JSON Ingest
            </button>
          )}
        </div>
      </div>

      {persona.role === 'PIC' && (
        <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-950">
          <div className="flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-indigo-700 shrink-0" />
            <span>
              <strong>Mode Simulasi PIC ({persona.name}):</strong> Menampilkan khusus{' '}
              <strong>{kpis.total_projects} proyek</strong> milik {persona.name} (seluruh KPI,
              filter, detail, dan aksi terisolasi di Frontend &amp; Backend API).
            </span>
          </div>
          <button
            type="button"
            onClick={onSwitchToDirector}
            className="px-3 py-1.5 rounded-md bg-indigo-900 text-white font-semibold hover:bg-indigo-800 cursor-pointer shrink-0"
          >
            Beralih ke Director (Semua Proyek)
          </button>
        </div>
      )}

      {/* Executive KPI Strip (Strictly scoped to active persona!) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>{persona.role === 'PIC' ? `Proyek ${persona.name}` : 'Total Proyek'}</span>
            <ClipboardList className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {kpis.total_projects}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5">
            {kpis.low_or_verified} terverifikasi sehat/selesai
          </div>
        </div>

        <div className="bg-rose-50/70 border border-rose-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-semibold text-rose-800 flex items-center justify-between">
            <span>Perlu Intervensi Kritis</span>
            <AlertOctagon className="w-4 h-4 text-rose-600" />
          </div>
          <div className="text-2xl font-extrabold text-rose-900 mt-1 tabular-nums">
            {kpis.critical_attention}
          </div>
          <div className="text-[11px] text-rose-700 mt-0.5">
            +{kpis.high_attention} proyek risiko tinggi
          </div>
        </div>

        <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-semibold text-amber-900 flex items-center justify-between">
            <span>Gap Laporan vs Bukti</span>
            <AlertTriangle className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-amber-950 mt-1 tabular-nums">
            {kpis.projects_with_discrepancy}
          </div>
          <div className="text-[11px] text-amber-800 mt-0.5">
            Selisih hitung, workflow, atau log
          </div>
        </div>

        <div className="bg-purple-50/60 border border-purple-200 rounded-xl p-4 shadow-xs">
          <div className="text-xs font-semibold text-purple-900 flex items-center justify-between">
            <span>Risiko Jadwal / Data Usang</span>
            <Clock className="w-4 h-4 text-purple-600" />
          </div>
          <div className="text-2xl font-extrabold text-purple-950 mt-1 tabular-nums">
            {kpis.projects_with_schedule_risk} / {kpis.projects_with_stale_data}
          </div>
          <div className="text-[11px] text-purple-800 mt-0.5">
            Jadwal tertekan / blind spot &gt;72j
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs col-span-2 lg:col-span-1">
          <div className="text-xs font-medium text-slate-500 flex items-center justify-between">
            <span>Follow-Up Aktif</span>
            <CheckCircle2 className="w-4 h-4 text-slate-400" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 mt-1 tabular-nums">
            {kpis.open_followups}
          </div>
          <div className="text-[11px] text-amber-700 font-medium mt-0.5">
            {kpis.resolved_awaiting_evidence} resolved belum terverifikasi
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'ALL', label: `Semua (${kpis.total_projects})` },
            {
              id: 'ACTION_NEEDED',
              label: `Kritis & Tinggi (${kpis.critical_attention + kpis.high_attention})`,
            },
            { id: 'DISCREPANCY', label: `Selisih Sumber (${kpis.projects_with_discrepancy})` },
            { id: 'STALE', label: `Data Usang (${kpis.projects_with_stale_data})` },
            { id: 'OK', label: `Terverifikasi OK (${kpis.low_or_verified})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id as typeof filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                filter === tab.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari proyek, customer, PIC..."
            className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900"
          />
        </div>
      </div>

      {/* Portfolio Project Cards (Director-ready scannability) */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-white border border-dashed border-slate-300 rounded-xl p-8 text-center text-xs text-slate-500">
            Tidak ada proyek yang cocok dengan filter atau pencarian saat ini.
          </div>
        )}
        {filtered.map((p: ProjectIntelligence) => {
          const da = p.deadline_analysis;
          return (
            <div
              key={p.project_id}
              onClick={() => onSelectProject(p.project_id)}
              className={`bg-white border border-slate-200 rounded-xl p-5 shadow-xs hover:shadow-md hover:border-slate-300 transition cursor-pointer ${borderAccent[p.attention_level]}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                {/* Identity & Verdict */}
                <div className="space-y-1.5 max-w-2xl">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-slate-500">
                      {p.project_id}
                    </span>
                    <AttentionBadge level={p.attention_level} />
                    <UncertaintyBadge level={p.uncertainty_level} />
                    <FeasibilityBadge verdict={da.feasibility_verdict} />
                  </div>
                  <h3 className="text-base font-bold text-slate-900">
                    {p.master.project_name}{' '}
                    <span className="font-normal text-slate-500">— {p.master.customer}</span>
                  </h3>
                  <div className="text-xs text-slate-500 flex flex-wrap gap-x-4 gap-y-1">
                    <span>
                      Tipe: <strong className="text-slate-700">{p.master.project_type}</strong>
                    </span>
                    <span>
                      PIC: <strong className="text-slate-700">{p.master.pic}</strong>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5" />
                      Deadline: <strong className="font-mono text-slate-800">{p.master.deadline}</strong>
                      {!da.is_completed && (
                        <span
                          className={`font-semibold ${da.remaining_days <= 7 ? 'text-rose-700' : 'text-slate-700'}`}
                        >
                          ({da.remaining_days >= 0 ? `sisa ${da.remaining_days} hari` : `telat ${Math.abs(da.remaining_days)} hari`})
                        </span>
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 pt-1 leading-relaxed">
                    <span className="font-bold text-slate-900">{p.key_verdict}:</span>{' '}
                    {p.executive_summary}
                  </p>
                </div>

                {/* Right-side Quantitative Comparison: Reported vs Operational */}
                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-3 min-w-[260px]">
                  <div className="grid grid-cols-2 gap-2.5 w-full text-xs tabular-nums">
                    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                      <div className="text-[10px] font-bold uppercase text-slate-500">
                        Reported Master
                      </div>
                      <div className="text-base font-extrabold text-slate-900">
                        {p.master.reported_progress_pct}%
                      </div>
                      <div className="text-[11px] text-slate-600">
                        {p.master.reported_actual.toLocaleString('en-US')} /{' '}
                        {p.master.target.toLocaleString('en-US')} {p.master.target_unit}
                      </div>
                      <div className="text-[10px] font-semibold text-indigo-700 mt-0.5">
                        Status: {p.master.reported_status}
                      </div>
                    </div>

                    <div className="p-2.5 rounded-lg bg-teal-50/70 border border-teal-200">
                      <div className="text-[10px] font-bold uppercase text-teal-800">
                        Operational Verified
                      </div>
                      <div className="text-base font-extrabold text-teal-950">
                        {da.operational_verified_pct !== null
                          ? `${da.operational_verified_pct}%`
                          : 'N/A'}
                      </div>
                      <div className="text-[11px] text-teal-900">
                        {da.operational_verified_actual !== null
                          ? `${da.operational_verified_actual.toLocaleString('en-US')} ${p.master.target_unit}`
                          : 'No snapshot'}
                      </div>
                      <div className="text-[10px] text-teal-800 mt-0.5 font-mono">
                        {p.operational_summary.latest_timestamp
                          ? p.operational_summary.latest_timestamp.slice(5, 16).replace('T', ' ')
                          : '—'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between w-full text-xs">
                    <div className="flex items-center gap-3 text-slate-500">
                      <span>
                        <strong className="text-slate-800">{p.signals.length}</strong> temuan
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <HelpCircle className="w-3.5 h-3.5 text-purple-600" />
                        <strong className="text-slate-800">{p.unknowns.length}</strong> unknowns
                      </span>
                      <span>
                        <strong className="text-slate-800">{p.open_followup_count}</strong> follow-up
                      </span>
                    </div>
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                      Telusuri Bukti <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
