import { AlertCircle, CheckCircle2, Database, RefreshCw, Upload, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchIngestionRuns, ingestPayloads, triggerDiskRefresh } from '../api';
import type { IngestionRunSummary } from '../types';

interface RefreshModalProps {
  open: boolean;
  onClose: () => void;
  onDataChanged: (suggestedAsOf?: string) => Promise<void>;
}

const DEMO_PRJ005_RECOVERY_JSON = JSON.stringify(
  {
    generated_at: '2026-10-07T11:30:00',
    records: [
      {
        source_record_id: 'API-EPS-003-LIVE',
        project_id: 'PRJ-005',
        source_system: 'api_monitor',
        record_type: 'environment_check',
        timestamp: '2026-10-07T09:15:00',
        environment: 'production',
        connection_status: 'CONNECTED',
        last_successful_connection: '2026-10-07T09:14:00',
      },
      {
        source_record_id: 'API-EPS-004-LIVE',
        project_id: 'PRJ-005',
        source_system: 'api_monitor',
        record_type: 'integration_snapshot',
        timestamp: '2026-10-07T11:00:00',
        developed_endpoints: 10,
        configured_endpoints: 10,
        production_tested_endpoints: 10,
        target_endpoints: 10,
      },
    ],
  },
  null,
  2
);

const DEMO_RESILIENCE_TEST_JSON = JSON.stringify(
  {
    records: [
      {
        source_record_id: 'SCAN-BETA-003',
        project_id: 'PRJ-002',
        source_system: 'scanner_production_log',
        record_type: 'scanner_status',
        timestamp: '2026-10-06T15:30:00',
        scanners: [
          { scanner_id: 'SCN-A', status: 'RUNNING' },
          { scanner_id: 'SCN-B', status: 'RUNNING' },
        ],
      },
      {
        source_record_id: 'BAD-RECORD-001',
        project_id: 'PRJ-001',
        source_system: 'archive_production_report',
        record_type: 'production_snapshot',
        timestamp: 'invalid-date',
        verified_quantity: 'not-a-number',
      },
    ],
  },
  null,
  2
);

export function RefreshModal({ open, onClose, onDataChanged }: RefreshModalProps) {
  const [runs, setRuns] = useState<IngestionRunSummary[]>([]);
  const [lastResult, setLastResult] = useState<IngestionRunSummary | null>(null);
  const [prodJson, setProdJson] = useState('');
  const [updatesCsv, setUpdatesCsv] = useState('');
  const [masterCsv, setMasterCsv] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      fetchIngestionRuns()
        .then((r) => setRuns(r.runs))
        .catch(() => {});
    }
  }, [open]);

  if (!open) return null;

  async function handleDiskRefresh() {
    setBusy(true);
    setError(null);
    try {
      const res = await triggerDiskRefresh();
      setLastResult(res);
      const updated = await fetchIngestionRuns();
      setRuns(updated.runs);
      await onDataChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleLiveIngest(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await ingestPayloads({
        masterCsv: masterCsv.trim() || undefined,
        updatesCsv: updatesCsv.trim() || undefined,
        prodJson: prodJson.trim() || undefined,
      });
      setLastResult(res);
      const updated = await fetchIngestionRuns();
      setRuns(updated.runs);
      // If ingested JSON contains 2026-10-07, suggest updating asOf so user immediately sees it
      const hasOct7 = prodJson.includes('2026-10-07') || updatesCsv.includes('2026-10-07');
      await onDataChanged(hasOct7 ? '2026-10-07T12:00:00' : undefined);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <Database className="w-5 h-5 text-slate-800" />
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Data Refresh, Live Ingest & Resilience Console (P5 & P6)
              </h2>
              <p className="text-xs text-slate-500">
                Proses ulang CSV/JSON dari disk atau injeksi data baru tanpa mengubah kode per project_id.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-6">
          {/* Mode 1: Disk Reload */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                1. Reload Authoritative Files dari Folder <code className="font-mono text-xs">/data</code>
              </h3>
              <p className="text-xs text-slate-600 mt-0.5">
                Kebijakan: duplikat identik dilewati idempoten • ID sama dengan isi beda ditandai konflik (tidak menimpa paksa) • record lebih lama disimpan sebagai historical backfill.
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleDiskRefresh}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
              Reload dari Disk
            </button>
          </div>

          {/* Mode 2: Live Ad-hoc Ingest for Q&A / Change Readiness */}
          <form onSubmit={handleLiveIngest} className="space-y-3 border border-slate-200 rounded-xl p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Upload className="w-4 h-4" /> 2. Live Ingest / Simulasi Perubahan Input (Change Readiness)
              </h3>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setProdJson(DEMO_PRJ005_RECOVERY_JSON);
                    setUpdatesCsv('');
                    setMasterCsv('');
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 cursor-pointer"
                >
                  Muat Contoh: PRJ-005 Production Connected
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setProdJson(DEMO_RESILIENCE_TEST_JSON);
                    setUpdatesCsv('');
                    setMasterCsv('');
                  }}
                  className="px-2.5 py-1 text-[11px] font-semibold rounded bg-amber-50 text-amber-900 border border-amber-200 hover:bg-amber-100 cursor-pointer"
                >
                  Muat Contoh: Conflict + Malformed Input (P6)
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Production Data JSON (opsional)
                </label>
                <textarea
                  rows={7}
                  value={prodJson}
                  onChange={(e) => setProdJson(e.target.value)}
                  placeholder='{ "records": [ ... ] }'
                  className="w-full font-mono text-[11px] p-2.5 border border-slate-300 rounded-lg bg-slate-50"
                />
              </div>
              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project Updates CSV (opsional)
                  </label>
                  <textarea
                    rows={3}
                    value={updatesCsv}
                    onChange={(e) => setUpdatesCsv(e.target.value)}
                    placeholder="update_id,project_id,timestamp,source_type,source_name,message"
                    className="w-full font-mono text-[11px] p-2 border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Project Master CSV (opsional)
                  </label>
                  <textarea
                    rows={3}
                    value={masterCsv}
                    onChange={(e) => setMasterCsv(e.target.value)}
                    placeholder="project_id,customer,project_name,..."
                    className="w-full font-mono text-[11px] p-2 border border-slate-300 rounded-lg bg-slate-50"
                  />
                </div>
              </div>
            </div>

            {error && (
              <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800">
                {error}
              </div>
            )}

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={busy}
                className="px-4 py-2 rounded-lg bg-teal-700 text-white text-xs font-semibold hover:bg-teal-800 disabled:opacity-50 cursor-pointer"
              >
                {busy ? 'Memproses...' : 'Jalankan Ingest & Evaluasi Ulang'}
              </button>
            </div>
          </form>

          {/* Latest Run Result */}
          {lastResult && (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <CheckCircle2 className="w-4 h-4 text-teal-600" />
                Hasil Eksekusi: {lastResult.run_id} ({lastResult.trigger})
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs tabular-nums">
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">Masters Upserted</div>
                  <div className="font-bold text-slate-900">{lastResult.masters_upserted}</div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">New Updates / Prod</div>
                  <div className="font-bold text-teal-700">
                    +{lastResult.updates_inserted} / +{lastResult.production_inserted}
                  </div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">Duplicates Skipped</div>
                  <div className="font-bold text-slate-700">
                    {lastResult.updates_duplicate_skipped + lastResult.production_duplicate_skipped}
                  </div>
                </div>
                <div className="p-2 bg-white rounded border border-slate-200">
                  <div className="text-slate-500">Conflicts / Quarantined</div>
                  <div className="font-bold text-amber-800">
                    {lastResult.updates_conflict_flagged + lastResult.production_conflict_flagged} /{' '}
                    {lastResult.quarantined_count}
                  </div>
                </div>
              </div>
              {lastResult.warnings.length > 0 && (
                <div className="space-y-1.5 pt-1">
                  <div className="text-[11px] font-bold text-slate-600 uppercase">
                    Warnings & Quarantined Records ({lastResult.warnings.length})
                  </div>
                  {lastResult.warnings.map((w, i) => (
                    <div
                      key={`${w.record_ref}-${i}`}
                      className={`p-2 rounded text-xs flex items-start gap-2 border ${
                        w.severity === 'ERROR'
                          ? 'bg-rose-50 border-rose-200 text-rose-900'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <div>
                        <span className="font-mono font-bold">
                          [{w.code}] {w.record_ref}
                        </span>
                        : {w.message}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ingestion Audit Log */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Riwayat Ingestion Runs ({runs.length})
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <tr>
                    <th className="py-2 px-3">Run ID</th>
                    <th className="py-2 px-3">Trigger</th>
                    <th className="py-2 px-3">Inserted (M/U/P)</th>
                    <th className="py-2 px-3">Dup Skipped</th>
                    <th className="py-2 px-3">Conflicts</th>
                    <th className="py-2 px-3">Quarantined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  {runs.map((r) => (
                    <tr key={r.run_id}>
                      <td className="py-2 px-3 text-slate-800">{r.run_id}</td>
                      <td className="py-2 px-3">{r.trigger}</td>
                      <td className="py-2 px-3">
                        {r.masters_upserted} / {r.updates_inserted} / {r.production_inserted}
                      </td>
                      <td className="py-2 px-3">
                        {r.updates_duplicate_skipped + r.production_duplicate_skipped}
                      </td>
                      <td className="py-2 px-3">
                        {r.updates_conflict_flagged + r.production_conflict_flagged}
                      </td>
                      <td className="py-2 px-3">{r.quarantined_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
