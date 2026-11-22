import { useCallback, useEffect, useState } from 'react';

interface Health {
  ok: boolean;
  as_of: string | null;
  counts: { projects: number; source_records: number; observation_values: number };
}

interface ImportRun {
  as_of: string | null;
  inserted: number;
  updated: number;
  duplicates: number;
  rejected: number;
  late_arrivals: number;
  orphans: number;
  finished_at: string;
  inventory: { projects: number; updates: number; production: number; sourceRecords: number; observationValues: number };
  issues: Array<{ severity: string; code: string; message: string; project_id: string | null; source_ref_id: string | null }>;
}

interface Inventory {
  as_of: string | null;
  by_kind: Array<{ source_kind: string; provenance: string; count: number }>;
  per_project: Array<{ project_id: string; source_kind: string; count: number }>;
}

const KIND_LABEL: Record<string, string> = {
  MASTER: 'Master',
  UPDATE: 'Update lapangan',
  PRODUCTION: 'Produksi / monitoring',
};

export default function App() {
  const [health, setHealth] = useState<Health | null>(null);
  const [run, setRun] = useState<ImportRun | null>(null);
  const [inv, setInv] = useState<Inventory | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [h, r, i] = await Promise.all([
        fetch('/healthz').then((x) => x.json()),
        fetch('/api/import-runs/latest').then((x) => x.json()),
        fetch('/api/source-inventory').then((x) => x.json()),
      ]);
      setHealth(h);
      setRun('inventory' in r ? r : null);
      setInv(i);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reimport() {
    setBusy(true);
    try {
      const res = await fetch('/api/import', { method: 'POST' });
      const body = await res.json();
      if (!res.ok) setError(`${body.error ?? 'ERROR'}: ${body.message ?? ''}`);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const perProject = new Map<string, Record<string, number>>();
  for (const row of inv?.per_project ?? []) {
    const entry = perProject.get(row.project_id) ?? {};
    entry[row.source_kind] = row.count;
    perProject.set(row.project_id, entry);
  }

  return (
    <div className="shell">
      <header className="top">
        <div>
          <h1>OnTrack <span>Project Intelligence</span></h1>
          <p className="sub">Importer dan penyimpanan sumber sudah jalan. Portofolio, penilaian perhatian, dan tindak lanjut menyusul.</p>
        </div>
        <div className="asof">
          <span className="label">as-of</span>
          <strong>{health?.as_of ?? '—'}</strong>
        </div>
      </header>

      {error && <div className="banner err">{error}</div>}
      {run?.issues?.length ? (
        <div className="banner warn">
          {run.issues.length} catatan impor: {run.issues.filter((i) => i.severity === 'ERROR').length} error,{' '}
          {run.issues.filter((i) => i.severity === 'WARN').length} warning
        </div>
      ) : null}

      <section className="grid">
        <Card title="Proyek" value={health?.counts.projects} note="baris master terbaca" />
        <Card title="Baris sumber" value={health?.counts.source_records} note="master + update + produksi" />
        <Card title="Nilai observasi" value={health?.counts.observation_values} note="metrik terekstrak" />
        <Card title="Nilai duplikat" value={run?.duplicates} note="tidak digandakan saat re-impor" />
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Jumlah per jenis sumber</h2>
          <button onClick={reimport} disabled={busy}>{busy ? 'Mengimpor…' : 'Impor ulang'}</button>
        </div>
        <table>
          <thead>
            <tr><th>Jenis</th><th>Provenance</th><th className="num">Jumlah</th></tr>
          </thead>
          <tbody>
            {(inv?.by_kind ?? []).map((k) => (
              <tr key={k.source_kind + k.provenance}>
                <td>{KIND_LABEL[k.source_kind] ?? k.source_kind}</td>
                <td><code>{k.provenance}</code></td>
                <td className="num">{k.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Baris sumber per proyek</h2>
          <span className="hint">Semua baris dari file sumber harus muncul di sini, termasuk yang tidak memicu temuan.</span>
        </div>
        <table>
          <thead>
            <tr><th>Proyek</th><th className="num">Master</th><th className="num">Update</th><th className="num">Produksi</th></tr>
          </thead>
          <tbody>
            {[...perProject.entries()].sort().map(([id, counts]) => (
              <tr key={id}>
                <td><code>{id}</code></td>
                <td className="num">{counts.MASTER ?? 0}</td>
                <td className="num">{counts.UPDATE ?? 0}</td>
                <td className="num">{counts.PRODUCTION ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {run?.issues?.length ? (
        <section className="panel">
          <div className="panel-head"><h2>Catatan impor</h2></div>
          <table>
            <thead><tr><th>Severity</th><th>Kode</th><th>Pesan</th></tr></thead>
            <tbody>
              {run.issues.map((i, idx) => (
                <tr key={idx}>
                  <td><code>{i.severity}</code></td>
                  <td><code>{i.code}</code></td>
                  <td>{i.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}

function Card({ title, value, note }: { title: string; value?: number; note: string }) {
  return (
    <div className="card">
      <span className="label">{title}</span>
      <strong>{value ?? '—'}</strong>
      <span className="note">{note}</span>
    </div>
  );
}
