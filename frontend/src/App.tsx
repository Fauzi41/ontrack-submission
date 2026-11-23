import { useCallback, useEffect, useState } from 'react';
import { ApiError, runImport, type ImportSummary } from './api';
import PortfolioView from './views/Portfolio';
import ProjectView from './views/Project';
import SourcesView from './views/Sources';

type View = { kind: 'portfolio' } | { kind: 'project'; id: string } | { kind: 'sources' };

export default function App() {
  const [view, setView] = useState<View>({ kind: 'portfolio' });
  const [asOf, setAsOf] = useState<string | null>(null);
  const [lastImport, setLastImport] = useState<ImportSummary | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const res = await fetch('/healthz');
      const body = (await res.json()) as { as_of: string | null };
      setAsOf(body.as_of);
    } catch {
      setAsOf(null);
    }
  }, []);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  async function onImport() {
    setBusy(true);
    setError(null);
    try {
      const summary = await runImport();
      setLastImport(summary);
      await loadMeta();
      setReloadKey((n) => n + 1);
    } catch (e) {
      const message = e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message;
      setError(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>
            OnTrack <span>Project Intelligence</span>
          </h1>
          <p className="sub">
            Setiap angka di layar ini datang dari baris sumber yang tersimpan. Kalau sebuah kalimat tidak punya bukti,
            layar menyebutnya terbuka, bukan menebak.
          </p>
        </div>
        <div className="asof">
          <span className="label">as-of data</span>
          <strong>{asOf ?? '—'}</strong>
        </div>
      </header>

      <nav className="tabs">
        <button
          className={view.kind === 'portfolio' ? 'tab active' : 'tab'}
          onClick={() => setView({ kind: 'portfolio' })}
        >
          Portofolio
        </button>
        <button className={view.kind === 'sources' ? 'tab active' : 'tab'} onClick={() => setView({ kind: 'sources' })}>
          Sumber data
        </button>
        <span className="spacer" />
        <button onClick={onImport} disabled={busy}>
          {busy ? 'Mengimpor…' : 'Impor ulang'}
        </button>
      </nav>

      {error && <div className="banner err">{error}</div>}
      {lastImport && (
        <div className="banner ok">
          Impor selesai: {lastImport.report.inserted} baris masuk, {lastImport.report.duplicates} duplikat,{' '}
          {lastImport.findings_impact.opened.length} temuan baru, {lastImport.issues_sync.opened} isu dibuka.
        </div>
      )}

      {view.kind === 'portfolio' && (
        <PortfolioView reloadKey={reloadKey} onOpen={(id) => setView({ kind: 'project', id })} />
      )}
      {view.kind === 'project' && <ProjectView projectId={view.id} onBack={() => setView({ kind: 'portfolio' })} />}
      {view.kind === 'sources' && <SourcesView lastImport={lastImport} />}
    </div>
  );
}
