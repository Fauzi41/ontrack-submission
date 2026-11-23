import { useCallback, useEffect, useState } from 'react';
import { LABEL, getIssues, getPortfolio, num, type Portfolio } from '../api';

interface Props {
  onOpen: (projectId: string) => void;
  reloadKey: number;
}

export default function PortfolioView({ onOpen, reloadKey }: Props) {
  const [data, setData] = useState<Portfolio | null>(null);
  const [byProject, setByProject] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [portfolio, issues] = await Promise.all([getPortfolio(), getIssues()]);
      setData(portfolio);
      const counts: Record<string, number> = {};
      for (const issue of issues.issues) {
        if (issue.status === 'VERIFIED_RESOLVED' || issue.status === 'NOT_DETECTED') continue;
        counts[issue.project_id] = (counts[issue.project_id] ?? 0) + 1;
      }
      setByProject(counts);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  if (error) return <div className="banner err">{error}</div>;
  if (!data) return <p className="hint">Memuat portofolio…</p>;

  const counts = data.counts ?? {};
  const openIssues = Object.entries(data.issue_counts ?? {}).reduce((sum, [status, n]) => (status === 'VERIFIED_RESOLVED' || status === 'NOT_DETECTED' ? sum : sum + n), 0);

  return (
    <>
      <section className="grid">
        <div className="card">
          <span className="label">Kritis</span>
          <strong className="sev-critical">{counts.critical ?? 0}</strong>
          <span className="note">butuh keputusan hari ini</span>
        </div>
        <div className="card">
          <span className="label">Perhatian</span>
          <strong className="sev-attention">{counts.attention ?? 0}</strong>
          <span className="note">masih bisa diperbaiki minggu ini</span>
        </div>
        <div className="card">
          <span className="label">Pantau</span>
          <strong className="sev-watch">{counts.watch ?? 0}</strong>
          <span className="note">belum mendesak, jangan ditinggal</span>
        </div>
        <div className="card">
          <span className="label">Isu terbuka</span>
          <strong>{openIssues}</strong>
          <span className="note">belum ada bukti perbaikan</span>
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Urutan perhatian</h2>
          <span className="hint">Urutan dihitung mesin dari severity, tekanan waktu, keyakinan, lalu bukti. Bukan urutan abjad.</span>
        </div>
        <table>
          <thead>
            <tr>
              <th className="num">#</th>
              <th>Proyek</th>
              <th>Severity</th>
              <th>Waktu</th>
              <th className="num">Sisa hari</th>
              <th className="num">Temuan</th>
              <th className="num">Isu</th>
            </tr>
          </thead>
          <tbody>
            {data.projects.map((p) => (
              <tr key={p.project_id} className="row-click" onClick={() => onOpen(p.project_id)}>
                <td className="num">
                  {p.rank === null ? '—' : `${p.rank}${p.tied ? '=' : ''}`}
                </td>
                <td>
                  <div className="proj">
                    <code>{p.project_id}</code>
                    <span>{p.project_name}</span>
                  </div>
                  <div className="hint">{p.customer} · PIC {p.pic ?? 'tidak dicatat'} · {p.project_type}</div>
                </td>
                <td>
                  <span className={`chip sev-${p.top_severity}`}>{LABEL.severity[p.top_severity]}</span>
                </td>
                <td>
                  <span className={`chip time-${p.time_pressure.toLowerCase()}`}>{LABEL.time[p.time_pressure]}</span>
                </td>
                <td className="num">{p.days_remaining === null ? '—' : num(p.days_remaining, 1)}</td>
                <td className="num">{p.findings.filter((f) => f.severity_final !== 'info').length}</td>
                <td className="num">{byProject[p.project_id] ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Ringkasan per proyek</h2>
          <span className="hint">Kalimat di bawah ditulis dari temuan yang sama yang bisa kamu buka satu per satu.</span>
        </div>
        <div className="stack">
          {data.projects.map((p) => (
            <div key={p.project_id} className="brief">
              <div className="brief-head">
                <code>{p.project_id}</code>
                <span className={`chip sev-${p.top_severity}`}>{LABEL.severity[p.top_severity]}</span>
                <button onClick={() => onOpen(p.project_id)}>Buka</button>
              </div>
              <p>{p.narrative}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
