import {
  ArrowLeft,
  ArrowRight,
  Calculator,
  CheckCircle2,
  Edit3,
  FilePlus2,
  Lock,
  MessageSquarePlus,
  Plus,
  RotateCcw,
  Save,
  Server,
  ShieldCheck,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  appendOperationalSnapshot,
  appendProjectUpdate,
  resetAllData,
  saveProjectMaster,
} from '../api';
import type {
  ActivePersona,
  PortfolioOverview,
  ProjectIntelligence,
  ProjectMasterRecord,
} from '../types';
import { AttentionBadge, FeasibilityBadge, UncertaintyBadge } from './Badges';

interface DataManagerViewProps {
  portfolio: PortfolioOverview;
  persona: ActivePersona;
  asOf: string;
  onSwitchToDirector: () => void;
  onDataChanged: (suggestedAsOf?: string) => Promise<void>;
  onOpenProject: (projectId: string) => void;
  onBack: () => void;
}

type ManagerTab = 'MASTER' | 'PRODUCTION' | 'UPDATES' | 'RESET';
type ProdPreset =
  | 'PAGES'
  | 'VERIFIED_ML'
  | 'BOXES'
  | 'RECORDS_VERIFIED'
  | 'RECORDS_SKIPPED'
  | 'SCANNERS'
  | 'API_ENDPOINTS'
  | 'API_ENV'
  | 'DMS_USAGE';

function suggestPresetForProject(p: ProjectIntelligence | undefined): ProdPreset {
  if (!p) return 'PAGES';
  const unit = p.master.target_unit.toLowerCase();
  if (unit === 'pages') return 'PAGES';
  if (unit === 'ml') return 'VERIFIED_ML';
  if (unit === 'boxes') return 'BOXES';
  if (unit === 'records') return 'RECORDS_VERIFIED';
  if (unit === 'endpoints') return 'API_ENDPOINTS';
  if (unit === 'system') return 'DMS_USAGE';
  return 'VERIFIED_ML';
}

export function DataManagerView({
  portfolio,
  persona,
  asOf,
  onSwitchToDirector,
  onDataChanged,
  onOpenProject,
  onBack,
}: DataManagerViewProps) {
  const isPicMode = persona.role === 'PIC';

  const editableProjects = useMemo(() => {
    if (!isPicMode) return portfolio.projects;
    return portfolio.projects.filter(
      (p) => p.master.pic.toLowerCase() === persona.name.toLowerCase()
    );
  }, [portfolio.projects, isPicMode, persona.name]);

  const [tab, setTab] = useState<ManagerTab>('MASTER');
  const [selectedId, setSelectedId] = useState<string>(
    editableProjects[0]?.project_id ?? portfolio.projects[0]?.project_id ?? 'PRJ-002'
  );
  const [isNewProject, setIsNewProject] = useState(false);
  const [autoCalcPct, setAutoCalcPct] = useState(true);

  // Auto-scope selectedId whenever persona switches (e.g., Director -> PIC Kevin -> PIC Maya)
  useEffect(() => {
    if (isPicMode) {
      setIsNewProject(false);
      if (!editableProjects.some((p) => p.project_id === selectedId)) {
        if (editableProjects[0]) setSelectedId(editableProjects[0].project_id);
      }
      if (tab === 'PRODUCTION') {
        setTab('MASTER');
      }
    }
  }, [isPicMode, persona.name, editableProjects, selectedId, tab]);

  // Master Form State
  const [masterForm, setMasterForm] = useState<ProjectMasterRecord>(() => {
    const first = portfolio.projects[0]?.master;
    return (
      first ?? {
        project_id: 'PRJ-007',
        customer: 'Instansi Baru',
        project_name: 'Proyek Baru',
        project_type: 'Document Digitalisation',
        pic: 'Budi',
        start_date: '2026-09-15',
        deadline: '2026-10-25',
        target: 50000,
        target_unit: 'pages',
        reported_actual: 25000,
        reported_progress_pct: 50,
        reported_status: 'ON TRACK',
        last_reported_update_at: asOf,
      }
    );
  });

  // Operational Snapshot Form State
  const [prodPreset, setProdPreset] = useState<ProdPreset>('PAGES');
  const [prodTimestamp, setProdTimestamp] = useState(asOf);
  const [prodNumValue, setProdNumValue] = useState('95000');
  const [prodPendingValue, setProdPendingValue] = useState('0');
  const [scannerA, setScannerA] = useState('RUNNING');
  const [scannerB, setScannerB] = useState('RUNNING');
  const [scannerC, setScannerC] = useState('RUNNING');
  const [apiDev, setApiDev] = useState('10');
  const [apiCfg, setApiCfg] = useState('10');
  const [apiTested, setApiTested] = useState('10');
  const [apiTarget, setApiTarget] = useState('10');
  const [envStatus, setEnvStatus] = useState('CONNECTED');
  const [dmsAppStatus, setDmsAppStatus] = useState('ONLINE');
  const [dmsActiveUsers, setDmsActiveUsers] = useState('18');
  const [dmsOkLogins, setDmsOkLogins] = useState('25');
  const [dmsFailLogins, setDmsFailLogins] = useState('0');

  // Update Message Form State
  const [updSourceType, setUpdSourceType] = useState('PROJECT_MANAGER');
  const [updSourceName, setUpdSourceName] = useState('');
  const [updTimestamp, setUpdTimestamp] = useState(asOf);
  const [updMessage, setUpdMessage] = useState('');

  // Reset State
  const [resetFollowUps, setResetFollowUps] = useState(false);

  // Feedback State
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const activeProject = editableProjects.find((p) => p.project_id === selectedId);

  // Sync forms when selecting another project
  useEffect(() => {
    if (!isNewProject && activeProject) {
      setMasterForm({ ...activeProject.master });
      setAutoCalcPct(true);
      const suggested = suggestPresetForProject(activeProject);
      setProdPreset(suggested);
      setUpdSourceName(activeProject.master.pic);
      if (activeProject.operational_summary.verified_quantity !== null) {
        setProdNumValue(String(activeProject.operational_summary.verified_quantity));
      } else {
        setProdNumValue(String(activeProject.master.reported_actual));
      }
      if (activeProject.operational_summary.pending_quantity !== null) {
        setProdPendingValue(String(activeProject.operational_summary.pending_quantity));
      }
      if (activeProject.operational_summary.integration_target !== null) {
        setApiTarget(String(activeProject.operational_summary.integration_target));
        setApiDev(String(activeProject.operational_summary.integration_developed ?? 0));
        setApiCfg(String(activeProject.operational_summary.integration_configured ?? 0));
        setApiTested(String(activeProject.operational_summary.integration_production_tested ?? 0));
      }
    }
  }, [selectedId, isNewProject, activeProject]);

  useEffect(() => {
    setProdTimestamp(asOf);
    setUpdTimestamp(asOf);
  }, [asOf]);

  function startNewProject() {
    setIsNewProject(true);
    setAutoCalcPct(true);
    setSuccessMsg(null);
    setError(null);
    const nextNum = String(portfolio.projects.length + 1).padStart(3, '0');
    setMasterForm({
      project_id: `PRJ-${nextNum}`,
      customer: 'Instansi Baru',
      project_name: `Proyek Digitalisasi Baru ${nextNum}`,
      project_type: 'Document Digitalisation',
      pic: 'Budi',
      start_date: '2026-09-15',
      deadline: '2026-10-20',
      target: 50000,
      target_unit: 'pages',
      reported_actual: 28000,
      reported_progress_pct: 56,
      reported_status: 'ON TRACK',
      last_reported_update_at: asOf,
    });
  }

  async function handleSaveMaster(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const normalizedTs =
        masterForm.last_reported_update_at.length === 16
          ? `${masterForm.last_reported_update_at}:00`
          : masterForm.last_reported_update_at;
      const res = await saveProjectMaster(
        {
          ...masterForm,
          target: Number(masterForm.target),
          reported_actual: Number(masterForm.reported_actual),
          reported_progress_pct: Number(masterForm.reported_progress_pct),
          last_reported_update_at: normalizedTs,
        },
        asOf,
        persona
      );
      setIsNewProject(false);
      setSelectedId(res.project.project_id);
      const nextAsOf = Date.parse(normalizedTs) > Date.parse(asOf) ? normalizedTs : undefined;
      await onDataChanged(nextAsOf);
      setSuccessMsg(
        `Project Master ${res.project.project_id} disimpan & langsung direkalkulasi otomatis! Verdict: ${res.project.deadline_analysis.feasibility_verdict} (${res.project.attention_level}).`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddProduction(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const ts = prodTimestamp.length === 16 ? `${prodTimestamp}:00` : prodTimestamp;
      const targetUnit = activeProject?.master.target_unit ?? 'units';
      let source_system = 'operational_monitor';
      let record_type = 'production_snapshot';
      let metrics: Record<string, unknown> = {};

      if (prodPreset === 'PAGES') {
        source_system = 'scanner_production_log';
        record_type = 'production_snapshot';
        metrics = { pages_processed_total: Number(prodNumValue), unit: 'pages' };
      } else if (prodPreset === 'VERIFIED_ML') {
        source_system = 'archive_production_report';
        record_type = 'production_snapshot';
        metrics = {
          verified_quantity: Number(prodNumValue),
          pending_internal_check_quantity: Number(prodPendingValue),
          unit: targetUnit,
          workflow_state: 'VERIFIED',
        };
      } else if (prodPreset === 'BOXES') {
        source_system = 'warehouse_entry';
        record_type = 'production_snapshot';
        metrics = { processed_boxes: Number(prodNumValue), unit: 'boxes' };
      } else if (prodPreset === 'RECORDS_VERIFIED') {
        source_system = 'verification_application';
        record_type = 'verification_snapshot';
        metrics = { records_verified: Number(prodNumValue), unit: 'records' };
      } else if (prodPreset === 'RECORDS_SKIPPED') {
        source_system = 'verification_application';
        record_type = 'verification_quality_snapshot';
        metrics = { records_skipped_missing_region: Number(prodNumValue), unit: 'records' };
      } else if (prodPreset === 'SCANNERS') {
        source_system = 'scanner_production_log';
        record_type = 'scanner_status';
        metrics = {
          scanners: [
            { scanner_id: 'SCN-A', status: scannerA },
            { scanner_id: 'SCN-B', status: scannerB },
            { scanner_id: 'SCN-C', status: scannerC },
          ],
        };
      } else if (prodPreset === 'API_ENDPOINTS') {
        source_system = 'api_monitor';
        record_type = 'integration_snapshot';
        metrics = {
          developed_endpoints: Number(apiDev),
          configured_endpoints: Number(apiCfg),
          production_tested_endpoints: Number(apiTested),
          target_endpoints: Number(apiTarget),
        };
      } else if (prodPreset === 'API_ENV') {
        source_system = 'api_monitor';
        record_type = 'environment_check';
        metrics = {
          environment: 'production',
          connection_status: envStatus,
          last_successful_connection: envStatus === 'CONNECTED' ? ts : null,
        };
      } else if (prodPreset === 'DMS_USAGE') {
        source_system = 'dms_monitor';
        record_type = 'usage_snapshot';
        metrics = {
          application_status: dmsAppStatus,
          active_users_last_24h: Number(dmsActiveUsers),
          successful_logins_last_24h: Number(dmsOkLogins),
          failed_logins_last_24h: Number(dmsFailLogins),
        };
      }

      const nextAsOf = Date.parse(ts) > Date.parse(asOf) ? ts : asOf;
      const res = await appendOperationalSnapshot(
        {
          project_id: selectedId,
          source_system,
          record_type,
          timestamp: ts,
          metrics,
        },
        nextAsOf,
        persona
      );
      await onDataChanged(nextAsOf !== asOf ? nextAsOf : undefined);
      setSuccessMsg(
        `Snapshot operasional baru (${res.source_record_id}) berhasil ditambahkan (append-only) & seluruh perhitungan otomatis diperbarui!`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAddUpdate(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const ts = updTimestamp.length === 16 ? `${updTimestamp}:00` : updTimestamp;
      const nextAsOf = Date.parse(ts) > Date.parse(asOf) ? ts : asOf;
      const res = await appendProjectUpdate(
        {
          project_id: selectedId,
          timestamp: ts,
          source_type: updSourceType,
          source_name: updSourceName.trim() || 'PIC',
          message: updMessage.trim(),
        },
        nextAsOf,
        persona
      );
      setUpdMessage('');
      await onDataChanged(nextAsOf !== asOf ? nextAsOf : undefined);
      setSuccessMsg(
        `Update baru (${res.update_id}) berhasil dicatat ke timeline & langsung dievaluasi oleh mesin aturan!`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleReset() {
    setBusy(true);
    setError(null);
    setSuccessMsg(null);
    try {
      await resetAllData(
        { resetFollowUps, scope: isPicMode ? 'OWN' : 'ALL' },
        persona
      );
      setIsNewProject(false);
      await onDataChanged('2026-10-06T17:00:00');
      setSuccessMsg(
        isPicMode
          ? `Proyek milik ${persona.name} berhasil dikembalikan ke data awal asli folder /data (bukan dikosongkan; proyek PIC lain tidak berubah).`
          : `Seluruh dataset berhasil dikembalikan ke data awal asli folder /data (${resetFollowUps ? 'termasuk reset follow-up' : 'follow-up tetap dipertahankan'}).`
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const da = activeProject?.deadline_analysis;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div>
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 mb-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Kembali ke Portfolio Overview
          </button>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Edit3 className="w-5 h-5 text-teal-700" />
            Data Control &amp; Live Recalculation Dashboard
          </h1>
          <p className="text-xs text-slate-600 mt-0.5">
            Ubah Project Master, tambah snapshot bukti operasional baru (append-only), atau tambah update lapangan — seluruh rumus deadline &amp; sinyal perhatian langsung terkalkulasi ulang secara otomatis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs font-semibold text-slate-600">Pilih Proyek:</label>
          <select
            value={isNewProject ? '__NEW__' : selectedId}
            onChange={(e) => {
              if (e.target.value === '__NEW__' && !isPicMode) {
                startNewProject();
              } else {
                setIsNewProject(false);
                setSelectedId(e.target.value);
                setSuccessMsg(null);
                setError(null);
              }
            }}
            className="px-3 py-2 text-xs font-semibold bg-slate-50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
          >
            {editableProjects.map((p) => (
              <option key={p.project_id} value={p.project_id}>
                {p.project_id} — {p.master.project_name} ({p.master.pic})
              </option>
            ))}
            {!isPicMode && <option value="__NEW__">+ Tambah Proyek Baru...</option>}
          </select>
        </div>
      </div>

      {/* Persona Access Scope Banner */}
      {isPicMode ? (
        <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-3 text-xs text-indigo-950">
          <div className="flex items-center gap-2">
            <Lock className="w-4 h-4 text-indigo-700 shrink-0" />
            <span>
              <strong>Hak Akses Terbatas — PIC {persona.name}:</strong> Anda hanya dapat mengubah
              laporan <em>Project Master</em>, menambahkan <em>Update Lapangan</em>, dan mereset ke
              data awal khusus proyek milik Anda sendiri (
              <strong>{editableProjects.map((p) => p.project_id).join(', ') || '—'}</strong>). Data
              proyek PIC lain dan bukti operasional sistem dikunci (ditegakkan di UI &amp; Backend
              API <code>403 Forbidden</code>).
            </span>
          </div>
          <button
            type="button"
            onClick={onSwitchToDirector}
            className="px-3 py-1.5 rounded-lg bg-indigo-900 text-white font-semibold hover:bg-indigo-800 cursor-pointer shrink-0"
          >
            Beralih ke Mode Director
          </button>
        </div>
      ) : (
        <div className="p-3 rounded-xl bg-teal-50/70 border border-teal-200 flex items-center gap-2 text-xs text-teal-950">
          <ShieldCheck className="w-4 h-4 text-teal-700 shrink-0" />
          <span>
            <strong>Akses Penuh — Director (Management):</strong> Dapat mengedit semua proyek,
            menambah proyek baru, menambahkan snapshot bukti operasional, serta mereset dataset.
          </span>
        </div>
      )}

      {/* Mode Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'MASTER', label: '1. Edit Project Master', icon: FilePlus2, restricted: false },
          {
            id: 'PRODUCTION',
            label: isPicMode
              ? '2. Bukti Operasional (Khusus Director/Sistem)'
              : '2. Tambah Bukti Operasional (Snapshot Baru)',
            icon: isPicMode ? Lock : Server,
            restricted: isPicMode,
          },
          { id: 'UPDATES', label: '3. Tambah Update Lapangan / Kapasitas', icon: MessageSquarePlus, restricted: false },
          {
            id: 'RESET',
            label: isPicMode ? '4. Reset Proyek Saya ke Data Awal' : '4. Reset ke Dataset Awal',
            icon: RotateCcw,
            restricted: false,
          },
        ].map((item) => {
          const Icon = item.icon;
          const active = tab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setTab(item.id as ManagerTab);
                setError(null);
                setSuccessMsg(null);
              }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
                active
                  ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                  : item.restricted
                    ? 'bg-slate-100 text-slate-400 border-slate-200 hover:bg-slate-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Icon className="w-4 h-4" />
              {item.label}
            </button>
          );
        })}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
          {error}
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 font-medium flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}

      {/* Main 2-Column Workspace: Left Form + Right Live Recalculation Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
          {/* TAB 1: EDIT / ADD MASTER */}
          {tab === 'MASTER' && (
            <form onSubmit={handleSaveMaster} className="space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    {isNewProject
                      ? 'Buat Proyek Baru (Uji Zero-Hardcoding)'
                      : `Edit Project Master: ${masterForm.project_id}`}
                  </h2>
                  <p className="text-xs text-slate-500">
                    Ubah target, deadline, reported_actual, atau status — langsung memicu rekalkulasi otomatis.
                  </p>
                </div>
                {!isNewProject && !isPicMode && (
                  <button
                    type="button"
                    onClick={startNewProject}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" /> Proyek Baru
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Project ID *</label>
                  <input
                    required
                    disabled={!isNewProject}
                    value={masterForm.project_id}
                    onChange={(e) => setMasterForm({ ...masterForm, project_id: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono disabled:bg-slate-100"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Customer *</label>
                  <input
                    required
                    value={masterForm.customer}
                    onChange={(e) => setMasterForm({ ...masterForm, customer: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Nama Proyek *</label>
                  <input
                    required
                    value={masterForm.project_name}
                    onChange={(e) => setMasterForm({ ...masterForm, project_name: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tipe Proyek *</label>
                  <input
                    required
                    value={masterForm.project_type}
                    onChange={(e) => setMasterForm({ ...masterForm, project_type: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    PIC *{isPicMode ? ' (Terkunci)' : ''}
                  </label>
                  <input
                    required
                    disabled={isPicMode}
                    value={masterForm.pic}
                    onChange={(e) => setMasterForm({ ...masterForm, pic: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg disabled:bg-slate-100 disabled:text-slate-600"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Start Date *</label>
                  <input
                    type="date"
                    required
                    value={masterForm.start_date}
                    onChange={(e) => setMasterForm({ ...masterForm, start_date: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Deadline *</label>
                  <input
                    type="date"
                    required
                    value={masterForm.deadline}
                    onChange={(e) => setMasterForm({ ...masterForm, deadline: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Volume *</label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={masterForm.target}
                    onChange={(e) => {
                      const nextTarget = Number(e.target.value);
                      const nextPct =
                        autoCalcPct && Number.isFinite(nextTarget) && nextTarget > 0
                          ? Number(((masterForm.reported_actual / nextTarget) * 100).toFixed(2))
                          : masterForm.reported_progress_pct;
                      setMasterForm({
                        ...masterForm,
                        target: nextTarget,
                        reported_progress_pct: nextPct,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Target Unit *</label>
                  <input
                    required
                    value={masterForm.target_unit}
                    onChange={(e) => setMasterForm({ ...masterForm, target_unit: e.target.value })}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Reported Actual ({masterForm.target_unit}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    value={masterForm.reported_actual}
                    onChange={(e) => {
                      const nextActual = Number(e.target.value);
                      const nextPct =
                        autoCalcPct &&
                        Number.isFinite(nextActual) &&
                        Number.isFinite(masterForm.target) &&
                        masterForm.target > 0
                          ? Number(((nextActual / masterForm.target) * 100).toFixed(2))
                          : masterForm.reported_progress_pct;
                      setMasterForm({
                        ...masterForm,
                        reported_actual: nextActual,
                        reported_progress_pct: nextPct,
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-slate-700">
                      Reported Progress (%) *{' '}
                      <span className="font-normal text-[10px] text-slate-500">
                        {autoCalcPct ? '(Auto)' : '(Manual)'}
                      </span>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setAutoCalcPct(true);
                        if (masterForm.target > 0) {
                          const pct = Number(
                            ((masterForm.reported_actual / masterForm.target) * 100).toFixed(2)
                          );
                          setMasterForm({ ...masterForm, reported_progress_pct: pct });
                        }
                      }}
                      className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
                    >
                      Hitung Otomatis %
                    </button>
                  </div>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    max="200"
                    required
                    value={masterForm.reported_progress_pct}
                    onChange={(e) => {
                      setAutoCalcPct(false);
                      setMasterForm({
                        ...masterForm,
                        reported_progress_pct: Number(e.target.value),
                      });
                    }}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Reported Status *</label>
                  <select
                    value={masterForm.reported_status}
                    onChange={(e) =>
                      setMasterForm({ ...masterForm, reported_status: e.target.value })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="ON TRACK">ON TRACK</option>
                    <option value="AT RISK">AT RISK</option>
                    <option value="DELAYED">DELAYED</option>
                    <option value="COMPLETED">COMPLETED</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Last Reported Update At *
                  </label>
                  <input
                    type="datetime-local"
                    required
                    value={masterForm.last_reported_update_at.slice(0, 16)}
                    onChange={(e) =>
                      setMasterForm({
                        ...masterForm,
                        last_reported_update_at: `${e.target.value}:00`,
                      })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {busy ? 'Menyimpan...' : 'Simpan Master & Rekalkulasi Otomatis'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: APPEND PRODUCTION SNAPSHOT */}
          {tab === 'PRODUCTION' && isPicMode && (
            <div className="p-6 rounded-xl bg-amber-50 border border-amber-200 space-y-3 text-xs text-amber-950">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Lock className="w-4 h-4 text-amber-700" />
                Akses Dibatasi — Separation of Duties (Bukti Operasional Sistem)
              </div>
              <p className="leading-relaxed">
                Sesuai prinsip integritas bukti, <strong>PIC ({persona.name}) tidak diperbolehkan</strong>{' '}
                menambahkan atau memodifikasi snapshot <em>Production Data</em> secara mandiri agar
                laporan PIC tetap terpisah dari bukti sistem operasional.
              </p>
              <button
                type="button"
                onClick={onSwitchToDirector}
                className="px-4 py-2 rounded-lg bg-slate-900 text-white font-semibold hover:bg-slate-800 cursor-pointer"
              >
                Beralih ke Mode Director untuk Simulasi Ingest Bukti Sistem
              </button>
            </div>
          )}

          {tab === 'PRODUCTION' && !isPicMode && (
            <form onSubmit={handleAddProduction} className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  Tambah Snapshot Bukti Operasional Baru ({selectedId})
                </h2>
                <p className="text-xs text-slate-500">
                  Menjaga prinsip <strong>Immutable Evidence (P5)</strong>: menambahkan record baru dengan <code>source_record_id</code> unik tanpa menimpa histori lama. Jika timestamp lebih baru dari <code>As-Of</code>, tanggal acuan otomatis menyesuaikan.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis Snapshot Sistem *</label>
                  <select
                    value={prodPreset}
                    onChange={(e) => setProdPreset(e.target.value as ProdPreset)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-semibold"
                  >
                    <option value="PAGES">Scanner Log — Total Halaman (pages_processed_total)</option>
                    <option value="VERIFIED_ML">Archive Report — Verified &amp; Pending (ML)</option>
                    <option value="BOXES">Warehouse Entry — Processed Boxes</option>
                    <option value="RECORDS_VERIFIED">Verification App — Records Verified</option>
                    <option value="RECORDS_SKIPPED">Verification App — Records Skipped (Missing Region)</option>
                    <option value="SCANNERS">Scanner Status (SCN-A / SCN-B / SCN-C)</option>
                    <option value="API_ENDPOINTS">API Monitor — Integration Endpoints</option>
                    <option value="API_ENV">API Monitor — Production Environment Check</option>
                    <option value="DMS_USAGE">DMS Monitor — App Status &amp; Active Users</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Timestamp Snapshot *</label>
                  <input
                    type="datetime-local"
                    required
                    value={prodTimestamp.slice(0, 16)}
                    onChange={(e) => setProdTimestamp(`${e.target.value}:00`)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              {/* Dynamic Metric Inputs */}
              <div className="p-4 rounded-xl bg-teal-50/50 border border-teal-200 space-y-3 text-xs">
                {(prodPreset === 'PAGES' ||
                  prodPreset === 'BOXES' ||
                  prodPreset === 'RECORDS_VERIFIED' ||
                  prodPreset === 'RECORDS_SKIPPED') && (
                  <div>
                    <label className="block font-bold text-teal-950 mb-1">
                      {prodPreset === 'PAGES' && 'Total Halaman Kumulatif (pages_processed_total) *'}
                      {prodPreset === 'BOXES' && 'Total Box Diproses (processed_boxes) *'}
                      {prodPreset === 'RECORDS_VERIFIED' && 'Total Record Terverifikasi (records_verified) *'}
                      {prodPreset === 'RECORDS_SKIPPED' && 'Jumlah Record Dilewati (records_skipped_missing_region) *'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={prodNumValue}
                      onChange={(e) => setProdNumValue(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg font-mono font-bold text-slate-900"
                    />
                  </div>
                )}

                {prodPreset === 'VERIFIED_ML' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">
                        Verified Quantity *
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={prodNumValue}
                        onChange={(e) => setProdNumValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">
                        Pending Internal Check
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={prodPendingValue}
                        onChange={(e) => setProdPendingValue(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                )}

                {prodPreset === 'SCANNERS' && (
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { label: 'SCN-A', val: scannerA, set: setScannerA },
                      { label: 'SCN-B', val: scannerB, set: setScannerB },
                      { label: 'SCN-C', val: scannerC, set: setScannerC },
                    ].map((s) => (
                      <div key={s.label}>
                        <label className="block font-bold text-teal-950 mb-1">{s.label}</label>
                        <select
                          value={s.val}
                          onChange={(e) => s.set(e.target.value)}
                          className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                        >
                          <option value="RUNNING">RUNNING</option>
                          <option value="LIMITED">LIMITED</option>
                          <option value="OUT_OF_SERVICE">OUT_OF_SERVICE</option>
                        </select>
                      </div>
                    ))}
                  </div>
                )}

                {prodPreset === 'API_ENDPOINTS' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">Developed</label>
                      <input
                        type="number"
                        min="0"
                        value={apiDev}
                        onChange={(e) => setApiDev(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">Configured</label>
                      <input
                        type="number"
                        min="0"
                        value={apiCfg}
                        onChange={(e) => setApiCfg(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">Prod-Tested</label>
                      <input
                        type="number"
                        min="0"
                        value={apiTested}
                        onChange={(e) => setApiTested(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">Target</label>
                      <input
                        type="number"
                        min="1"
                        value={apiTarget}
                        onChange={(e) => setApiTarget(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                )}

                {prodPreset === 'API_ENV' && (
                  <div>
                    <label className="block font-bold text-teal-950 mb-1">
                      Production Connection Status
                    </label>
                    <select
                      value={envStatus}
                      onChange={(e) => setEnvStatus(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-teal-300 rounded-lg font-mono font-bold"
                    >
                      <option value="CONNECTED">CONNECTED</option>
                      <option value="NOT_CONFIGURED">NOT_CONFIGURED</option>
                      <option value="FAILED">FAILED</option>
                    </select>
                  </div>
                )}

                {prodPreset === 'DMS_USAGE' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">App Status</label>
                      <select
                        value={dmsAppStatus}
                        onChange={(e) => setDmsAppStatus(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      >
                        <option value="ONLINE">ONLINE</option>
                        <option value="DEGRADED">DEGRADED</option>
                        <option value="OFFLINE">OFFLINE</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">Active Users</label>
                      <input
                        type="number"
                        min="0"
                        value={dmsActiveUsers}
                        onChange={(e) => setDmsActiveUsers(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">Logins OK</label>
                      <input
                        type="number"
                        min="0"
                        value={dmsOkLogins}
                        onChange={(e) => setDmsOkLogins(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-teal-950 mb-1">Logins Fail</label>
                      <input
                        type="number"
                        min="0"
                        value={dmsFailLogins}
                        onChange={(e) => setDmsFailLogins(e.target.value)}
                        className="w-full px-2.5 py-2 bg-white border border-teal-300 rounded-lg font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-teal-700 text-white text-xs font-bold hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {busy ? 'Menyimpan...' : 'Simpan Snapshot Operasional & Rekalkulasi'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: APPEND PROJECT UPDATE */}
          {tab === 'UPDATES' && (
            <form onSubmit={handleAddUpdate} className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  Tambah Pesan / Update Lapangan Baru ({selectedId})
                </h2>
                <p className="text-xs text-slate-500">
                  Pesan yang menyebut kapasitas harian (mis. <em>"kapasitas tim meningkat menjadi 9.000 halaman per hari"</em>) akan otomatis dibaca oleh mesin batas kapasitas di <code>deadlineEngine.ts</code>.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Source Type</label>
                  <select
                    value={updSourceType}
                    onChange={(e) => setUpdSourceType(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  >
                    <option value="PROJECT_MANAGER">PROJECT_MANAGER</option>
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="FIELD_TEAM">FIELD_TEAM</option>
                    <option value="TECHNICAL_TEAM">TECHNICAL_TEAM</option>
                    <option value="ACCOUNT">ACCOUNT</option>
                    <option value="VENDOR">VENDOR</option>
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nama Sumber *</label>
                  <input
                    required
                    value={updSourceName}
                    onChange={(e) => setUpdSourceName(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Timestamp *</label>
                  <input
                    type="datetime-local"
                    required
                    value={updTimestamp.slice(0, 16)}
                    onChange={(e) => setUpdTimestamp(`${e.target.value}:00`)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg font-mono"
                  />
                </div>
              </div>

              <div className="text-xs space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="font-semibold text-slate-700">Isi Pesan Update *</label>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setUpdMessage(
                          'Tambahan 2 scanner cadangan dan shift malam aktif. Rata-rata kapasitas tim menjadi 9.000 halaman per hari.'
                        )
                      }
                      className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] hover:bg-slate-200 cursor-pointer"
                    >
                      Contoh: Kapasitas 9.000/hari
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setUpdMessage(
                          'Rekap terbaru gudang sudah diterima. Produksi berjalan lancar dan seluruh sisa box sedang dirampungkan.'
                        )
                      }
                      className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 text-[11px] hover:bg-slate-200 cursor-pointer"
                    >
                      Contoh: Update Segar (Anti-Stale)
                    </button>
                  </div>
                </div>
                <textarea
                  required
                  minLength={3}
                  rows={4}
                  value={updMessage}
                  onChange={(e) => setUpdMessage(e.target.value)}
                  placeholder="Tulis update lapangan, perubahan kapasitas, atau klarifikasi kendala..."
                  className="w-full p-3 border border-slate-300 rounded-lg"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-bold hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  {busy ? 'Menyimpan...' : 'Tambah Update & Rekalkulasi'}
                </button>
              </div>
            </form>
          )}

          {/* TAB 4: RESET TO AUTHORITATIVE DATA */}
          {tab === 'RESET' && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  {isPicMode
                    ? `Reset Proyek Milik ${persona.name} ke Data Awal Asli`
                    : 'Reset Seluruh Portofolio ke Data Awal Asli (/data)'}
                </h2>
                <p className="text-xs text-slate-600 mt-0.5">
                  {isPicMode
                    ? `Mengembalikan data proyek Anda (${editableProjects.map((p) => p.project_id).join(', ')}) ke nilai awal asli dari 02_Project_Master.csv, 03_Project_Updates.csv, dan 04_Production_Data.json — BUKAN dikosongkan. Data proyek PIC lain tetap utuh.`
                    : 'Mengembalikan seluruh 6 proyek, 23 updates, dan 12 snapshot bukti operasional persis ke nilai awal asli dari folder /data (As-Of 2026-10-06T17:00:00) — BUKAN dikosongkan.'}
                </p>
              </div>

              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetFollowUps}
                  onChange={(e) => setResetFollowUps(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>
                  {isPicMode
                    ? `Hapus juga catatan Follow-Up pada proyek milik ${persona.name}`
                    : 'Hapus juga seluruh catatan Follow-Up & riwayatnya'}
                </span>
              </label>

              <button
                type="button"
                disabled={busy}
                onClick={handleReset}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-700 text-white text-xs font-bold hover:bg-amber-800 disabled:opacity-50 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                {busy
                  ? 'Mengembalikan Data Awal...'
                  : isPicMode
                    ? `Kembalikan Proyek ${persona.name} ke Data Awal`
                    : 'Kembalikan Semua Data ke Dataset Awal'}
              </button>
            </div>
          )}
        </div>

        {/* RIGHT PANEL: LIVE RECALCULATION PREVIEW */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-teal-700" />
              <h3 className="text-sm font-bold text-slate-900">
                Hasil Rekalkulasi Live ({activeProject?.project_id ?? '—'})
              </h3>
            </div>
            {activeProject && (
              <button
                type="button"
                onClick={() => onOpenProject(activeProject.project_id)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
              >
                Detail Lengkap <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {!activeProject || !da ? (
            <p className="text-xs text-slate-500">
              Simpan proyek baru untuk melihat hasil kalkulasi otomatis di panel ini.
            </p>
          ) : (
            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap gap-1.5">
                <AttentionBadge level={activeProject.attention_level} />
                <UncertaintyBadge level={activeProject.uncertainty_level} />
                <FeasibilityBadge verdict={da.feasibility_verdict} />
              </div>

              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 space-y-1.5 tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-500">Periode &amp; As-Of:</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {da.elapsed_days}/{da.total_duration_days} hr (sisa {da.remaining_days} hr)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Reported Master:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {da.reported_actual.toLocaleString('en-US')} / {da.elapsed_days} hr (
                    {da.historical_daily_rate_reported ?? '—'}/hr)
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-teal-800 font-medium">Operational Verified:</span>
                  <span className="font-mono font-bold text-teal-900">
                    {da.operational_verified_actual !== null
                      ? `${da.operational_verified_actual.toLocaleString('en-US')} (${da.operational_verified_pct}%)`
                      : 'Tidak ada snapshot'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Laju Historis (Op):</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {da.historical_daily_rate_operational !== null
                      ? `${da.historical_daily_rate_operational.toLocaleString('en-US')} ${da.unit}/hr`
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Laju Wajib (Op):</span>
                  <span className="font-mono font-bold text-rose-700">
                    {da.required_daily_rate_operational !== null
                      ? `${da.required_daily_rate_operational.toLocaleString('en-US')} ${da.unit}/hr (${da.acceleration_factor_operational ?? '—'}x)`
                      : '—'}
                  </span>
                </div>
                {da.stated_capacity_per_day !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Batas Kapasitas Max:</span>
                    <span className="font-mono font-semibold text-amber-800">
                      {da.stated_capacity_per_day.toLocaleString('en-US')} {da.unit}/hr
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1.5 border-t border-slate-200">
                  <span className="text-slate-600 font-medium">Proyeksi Selesai:</span>
                  <span className="font-mono font-extrabold text-slate-900">
                    {da.projected_completion_date_operational ?? 'Blocked / N/A'}
                    {da.projected_slip_days_operational !== null &&
                      da.projected_slip_days_operational > 0 && (
                        <span className="text-rose-700 ml-1">
                          (+{da.projected_slip_days_operational}d)
                        </span>
                      )}
                  </span>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-bold uppercase text-slate-500 mb-1.5">
                  Sinyal Perhatian Aktif ({activeProject.signals.length})
                </div>
                {activeProject.signals.length === 0 ? (
                  <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 font-medium">
                    Tidak ada sinyal perhatian aktif (Verified OK).
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {activeProject.signals.map((s) => (
                      <div
                        key={s.signal_id}
                        className="p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                      >
                        <div className="font-mono text-[10px] font-bold text-slate-500">
                          [{s.severity}] {s.rule_code}
                        </div>
                        <div className="font-semibold text-slate-900 mt-0.5">{s.title}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
