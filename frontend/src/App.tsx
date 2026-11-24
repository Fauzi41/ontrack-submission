import {
  Activity,
  CalendarClock,
  CheckCircle2,
  RefreshCw,
  UserCheck,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchPortfolio, fetchProjectDetail, resetAllData } from './api';
import { DataManagerView } from './components/DataManagerView';
import { PortfolioView } from './components/PortfolioView';
import { ProjectDetailView } from './components/ProjectDetailView';
import { RefreshModal } from './components/RefreshModal';
import type { ActivePersona, PortfolioOverview, ProjectIntelligence } from './types';

const DEFAULT_AS_OF = '2026-10-06T17:00:00';
const DIRECTOR_PERSONA: ActivePersona = { role: 'DIRECTOR', name: 'Director (Management)' };

export function App() {
  const [asOf, setAsOf] = useState(DEFAULT_AS_OF);
  const [persona, setPersona] = useState<ActivePersona>(DIRECTOR_PERSONA);
  const [portfolio, setPortfolio] = useState<PortfolioOverview | null>(null);
  const [viewMode, setViewMode] = useState<'PORTFOLIO' | 'DATA_MANAGER'>('PORTFOLIO');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<ProjectIntelligence | null>(null);
  const [loading, setLoading] = useState(true);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshOpen, setRefreshOpen] = useState(false);

  const availablePics = useMemo(() => {
    if (!portfolio) return [];
    return portfolio.available_pics ?? Array.from(new Set(portfolio.projects.map((p) => p.master.pic))).sort();
  }, [portfolio]);

  const loadPortfolio = useCallback(async (targetAsOf: string, targetPersona: ActivePersona) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPortfolio(targetAsOf, targetPersona);
      setPortfolio(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadProject = useCallback(
    async (projectId: string, targetAsOf: string, targetPersona: ActivePersona) => {
      setLoading(true);
      setError(null);
      try {
        const data = await fetchProjectDetail(projectId, targetAsOf, targetPersona);
        setSelectedProject(data);
      } catch (err) {
        setError((err as Error).message);
        setSelectedProject(null);
        setSelectedProjectId(null);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    loadPortfolio(asOf, persona);
  }, [asOf, persona, loadPortfolio]);

  useEffect(() => {
    if (selectedProjectId) {
      loadProject(selectedProjectId, asOf, persona);
    } else {
      setSelectedProject(null);
    }
  }, [selectedProjectId, asOf, persona, loadProject]);

  async function handleDataChanged(suggestedAsOf?: string) {
    const nextAsOf = suggestedAsOf ?? asOf;
    if (suggestedAsOf) setAsOf(suggestedAsOf);
    await loadPortfolio(nextAsOf, persona);
    if (selectedProjectId) {
      await loadProject(selectedProjectId, nextAsOf, persona);
    }
  }

  async function handleQuickReset() {
    const isPic = persona.role === 'PIC';
    const confirmed = window.confirm(
      isPic
        ? `Kembalikan data proyek milik ${persona.name} ke data awal asli (bukan dikosongkan)? Data proyek PIC lain tidak akan tersentuh.`
        : 'Kembalikan seluruh 6 proyek ke data awal asli dataset (02_Project_Master.csv, 03_Project_Updates.csv, 04_Production_Data.json — bukan dikosongkan)?'
    );
    if (!confirmed) return;

    setResetting(true);
    setError(null);
    setNotice(null);
    try {
      await resetAllData(
        { resetFollowUps: false, scope: isPic ? 'OWN' : 'ALL' },
        persona
      );
      setAsOf(DEFAULT_AS_OF);
      await loadPortfolio(DEFAULT_AS_OF, persona);
      if (selectedProjectId) {
        await loadProject(selectedProjectId, DEFAULT_AS_OF, persona);
      }
      setNotice(
        isPic
          ? `Data proyek milik ${persona.name} berhasil dikembalikan ke dataset awal (As-Of 2026-10-06T17:00:00).`
          : 'Seluruh 6 proyek berhasil dikembalikan ke dataset awal asli (As-Of 2026-10-06T17:00:00).'
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* Sticky Top Header */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          <div
            onClick={() => {
              setSelectedProjectId(null);
              setViewMode('PORTFOLIO');
            }}
            className="flex items-center gap-2.5 cursor-pointer"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-900 text-white flex items-center justify-center shadow-xs">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold tracking-tight text-slate-900">
                  OnTrack Project Intelligence
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                  tata.id • v3.1
                </span>
              </div>
              <p className="text-[11px] text-slate-500">
                Source → Context → Evidence → Interpretation → Attention → Follow-Up
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Simulated Persona Switcher (No Auth Required) */}
            <div className="flex items-center gap-1.5 bg-indigo-50/80 px-2.5 py-1.5 rounded-lg border border-indigo-200 text-xs">
              <UserCheck className="w-3.5 h-3.5 text-indigo-700" />
              <span className="text-indigo-800 font-medium">Mode:</span>
              <select
                aria-label="Persona Switcher"
                value={persona.role === 'DIRECTOR' ? 'DIRECTOR' : `PIC:${persona.name}`}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'DIRECTOR') {
                    setPersona(DIRECTOR_PERSONA);
                  } else if (val.startsWith('PIC:')) {
                    setPersona({ role: 'PIC', name: val.slice(4) });
                    setSelectedProjectId(null);
                    setRefreshOpen(false);
                  }
                }}
                className="bg-transparent font-semibold text-indigo-950 focus:outline-none cursor-pointer"
              >
                <option value="DIRECTOR">Director (All Projects)</option>
                {availablePics.map((pic) => (
                  <option key={pic} value={`PIC:${pic}`}>
                    PIC — {pic}
                  </option>
                ))}
              </select>
            </div>

            {/* Explicit As-Of Date Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
              <CalendarClock className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-slate-600 font-medium">As-Of:</span>
              <input
                type="datetime-local"
                value={asOf.slice(0, 16)}
                onChange={(e) => {
                  if (e.target.value) setAsOf(`${e.target.value}:00`);
                }}
                className="bg-transparent font-mono text-xs font-semibold text-slate-900 focus:outline-none"
              />
              {asOf !== DEFAULT_AS_OF && (
                <button
                  type="button"
                  onClick={() => setAsOf(DEFAULT_AS_OF)}
                  className="text-[10px] font-semibold text-indigo-700 hover:underline cursor-pointer"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 flex-1">
        {notice && (
          <div className="mb-4 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              {notice}
            </span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              className="text-emerald-800 font-bold hover:underline cursor-pointer"
            >
              Tutup
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-sm text-rose-800 flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadPortfolio(asOf, persona)}
              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-rose-700 text-white text-xs font-semibold cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" /> Coba Lagi
            </button>
          </div>
        )}

        {loading && !portfolio ? (
          <div className="py-20 text-center text-sm text-slate-500">
            Memuat data portofolio & mengevaluasi bukti operasional...
          </div>
        ) : selectedProject ? (
          <ProjectDetailView
            project={selectedProject}
            persona={persona}
            onSwitchToDirector={() => setPersona(DIRECTOR_PERSONA)}
            onBack={() => setSelectedProjectId(null)}
            onRefreshProject={async () => {
              await loadProject(selectedProject.project_id, asOf, persona);
              await loadPortfolio(asOf, persona);
            }}
          />
        ) : viewMode === 'DATA_MANAGER' && portfolio ? (
          <DataManagerView
            portfolio={portfolio}
            persona={persona}
            asOf={asOf}
            onSwitchToDirector={() => setPersona(DIRECTOR_PERSONA)}
            onDataChanged={handleDataChanged}
            onOpenProject={(id) => {
              setViewMode('PORTFOLIO');
              setSelectedProjectId(id);
            }}
            onBack={() => setViewMode('PORTFOLIO')}
          />
        ) : portfolio ? (
          <PortfolioView
            portfolio={portfolio}
            persona={persona}
            resetting={resetting}
            onSwitchToDirector={() => setPersona(DIRECTOR_PERSONA)}
            onSelectProject={(id) => setSelectedProjectId(id)}
            onOpenDataManager={() => {
              setSelectedProjectId(null);
              setViewMode('DATA_MANAGER');
            }}
            onQuickReset={handleQuickReset}
            onOpenIngest={() => setRefreshOpen(true)}
          />
        ) : null}
      </main>

      <footer className="border-t border-slate-200 bg-white py-3 px-6 text-[11px] text-slate-500 flex flex-wrap justify-between gap-2 max-w-7xl w-full mx-auto">
        <span>
          Dataset Reference Date: <strong className="font-mono">2026-10-06</strong> (Synthetic Assessment Data)
        </span>
        <span>
          Zero per-project hardcoding • Evidence-based closure enforced • SQLite persistent follow-ups
        </span>
      </footer>

      <RefreshModal
        open={refreshOpen}
        onClose={() => setRefreshOpen(false)}
        onDataChanged={handleDataChanged}
      />
    </div>
  );
}

export default App;
