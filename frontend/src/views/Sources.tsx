import { useCallback, useEffect, useState } from 'react';
import { getInventory, type ImportSummary, type Inventory } from '../api';

const KIND_LABEL: Record<string, string> = {
  MASTER: 'Master',
  UPDATE: 'Update lapangan',
  PRODUCTION: 'Produksi / monitoring',
};

export default function SourcesView({ lastImport }: { lastImport: ImportSummary | null }) {
  const [inv, setInv] = useState<Inventory | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setInv(await getInventory());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, lastImport]);

  if (error) return <div className="banner err">{error}</div>;
  if (!inv) return <p className="hint">Memuat inventaris sumber…</p>;

  const perProject = new Map<string, Record<string, number>>();
  for (const row of inv.per_project) {
    const entry = perProject.get(row.project_id) ?? {};
    entry[row.source_kind] = row.count;
    perProject.set(row.project_id, entry);
  }

  return (
    <>
      <section className="panel">
        <div className="panel-head">
          <h2>Sumber yang tersimpan</h2>
          <span className="hint">Semua baris dari file sumber muncul di sini, termasuk yang tidak memicu temuan.</span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Jenis</th>
              <th>Provenance</th>
              <th className="num">Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {inv.by_kind.map((k) => (
              <tr key={k.source_kind + k.provenance}>
                <td>{KIND_LABEL[k.source_kind] ?? k.source_kind}</td>
                <td>
                  <code>{k.provenance}</code>
                </td>
                <td className="num">{k.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          REPORTED berarti angka yang dilaporkan orang. OPERATIONAL berarti angka dari sistem. Dua-duanya disimpan
          terpisah supaya selisihnya bisa dilihat.
        </p>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Baris per proyek</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th>Proyek</th>
              <th className="num">Master</th>
              <th className="num">Update</th>
              <th className="num">Produksi</th>
            </tr>
          </thead>
          <tbody>
            {[...perProject.entries()].sort().map(([id, counts]) => (
              <tr key={id}>
                <td>
                  <code>{id}</code>
                </td>
                <td className="num">{counts.MASTER ?? 0}</td>
                <td className="num">{counts.UPDATE ?? 0}</td>
                <td className="num">{counts.PRODUCTION ?? 0}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {lastImport && (
        <section className="panel">
          <div className="panel-head">
            <h2>Hasil impor terakhir</h2>
          </div>
          <div className="facts">
            <div className="fact">
              <span className="label">Baris masuk</span>
              <strong>{lastImport.report.inserted}</strong>
            </div>
            <div className="fact">
              <span className="label">Duplikat</span>
              <strong>{lastImport.report.duplicates}</strong>
            </div>
            <div className="fact">
              <span className="label">Temuan baru</span>
              <strong>{lastImport.findings_impact.opened.length}</strong>
            </div>
            <div className="fact">
              <span className="label">Isu baru</span>
              <strong>{lastImport.issues_sync.opened}</strong>
            </div>
          </div>
          {lastImport.report.impact.changed.length > 0 && (
            <>
              <h2>Field yang berubah</h2>
              <table>
                <thead>
                  <tr>
                    <th>Proyek</th>
                    <th>Field</th>
                    <th>Dari</th>
                    <th>Ke</th>
                  </tr>
                </thead>
                <tbody>
                  {lastImport.report.impact.changed.map((c) => (
                    <tr key={`${c.project_id}-${c.field}`}>
                      <td>
                        <code>{c.project_id}</code>
                      </td>
                      <td>{c.field}</td>
                      <td>{String(c.from ?? '—')}</td>
                      <td>{String(c.to ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {lastImport.report.issues.length > 0 && (
            <>
              <h2>Catatan impor</h2>
              <table>
                <thead>
                  <tr>
                    <th>Severity</th>
                    <th>Kode</th>
                    <th>Pesan</th>
                  </tr>
                </thead>
                <tbody>
                  {lastImport.report.issues.map((i, idx) => (
                    <tr key={idx}>
                      <td>
                        <code>{i.severity}</code>
                      </td>
                      <td>
                        <code>{i.code}</code>
                      </td>
                      <td>{i.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </section>
      )}
    </>
  );
}
