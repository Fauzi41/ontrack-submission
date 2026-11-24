import { Calculator, CalendarClock, Gauge, Info } from 'lucide-react';
import type { DeadlineAnalysis } from '../types';
import { FeasibilityBadge } from './Badges';

export function DeadlineBreakdown({ analysis }: { analysis: DeadlineAnalysis }) {
  const reportedPct = Math.min(100, Math.max(0, analysis.reported_progress_pct));
  const verifiedPct =
    analysis.operational_verified_pct !== null
      ? Math.min(100, Math.max(0, analysis.operational_verified_pct))
      : null;

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Calculator className="w-5 h-5 text-slate-700" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Analisis Deadline, Laju Produksi & Kelayakan Jadwal (Transparent Calculation)
            </h3>
            <p className="text-xs text-slate-500">
              Tanggal Acuan (As-Of Date): <span className="font-mono font-semibold text-slate-700">{analysis.as_of_date}</span> • Metode: Selisih hari kalender (UTC date delta)
            </p>
          </div>
        </div>
        <FeasibilityBadge verdict={analysis.feasibility_verdict} />
      </div>

      <div className="p-5 space-y-5">
        {/* Visual Timeline & Progress Bars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium flex items-center gap-1">
                <CalendarClock className="w-3.5 h-3.5" /> Garis Waktu Proyek
              </span>
              <span className="font-mono font-semibold text-slate-800">
                {analysis.time_elapsed_pct}% terpakai
              </span>
            </div>
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-slate-700 rounded-full"
                style={{ width: `${analysis.time_elapsed_pct}%` }}
              />
            </div>
            <div className="flex justify-between text-xs tabular-nums text-slate-600">
              <span>Start: {analysis.start_date}</span>
              <span className="font-semibold text-slate-900">
                {analysis.is_completed
                  ? 'Completed'
                  : analysis.remaining_days >= 0
                    ? `Sisa ${analysis.remaining_days} hari`
                    : `Lewat ${Math.abs(analysis.remaining_days)} hari`}
              </span>
              <span>Due: {analysis.deadline}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
              <span className="font-medium">Reported vs Operational Verified</span>
              <span className="font-mono text-slate-700">Target: {analysis.target.toLocaleString('en-US')} {analysis.unit}</span>
            </div>
            <div className="space-y-1.5 mt-1.5">
              <div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span className="text-slate-600">Reported Master ({analysis.reported_actual.toLocaleString('en-US')})</span>
                  <span className="font-mono font-semibold text-slate-800">{analysis.reported_progress_pct}%</span>
                </div>
                <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${reportedPct}%` }} />
                </div>
              </div>
              {verifiedPct !== null && (
                <div>
                  <div className="flex justify-between text-[11px] mb-0.5">
                    <span className="text-teal-800 font-medium">
                      Operational Verified ({analysis.operational_verified_actual?.toLocaleString('en-US')})
                    </span>
                    <span className="font-mono font-semibold text-teal-800">{verifiedPct}%</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                    <div className="h-full bg-teal-600 rounded-full" style={{ width: `${verifiedPct}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-3.5 rounded-lg border border-slate-200 bg-slate-50/50">
            <div className="flex items-center gap-1 text-xs text-slate-500 font-medium mb-1">
              <Gauge className="w-3.5 h-3.5" /> Ringkasan Laju & Proyeksi
            </div>
            {analysis.is_completed ? (
              <p className="text-xs text-emerald-800 font-medium mt-2">
                Proyek telah ditutup sesuai jadwal ({analysis.deadline}). Tidak ada sisa beban produksi.
              </p>
            ) : (
              <div className="space-y-1 text-xs tabular-nums">
                <div className="flex justify-between">
                  <span className="text-slate-600">Laju Historis (Op):</span>
                  <span className="font-mono font-semibold text-slate-900">
                    {analysis.historical_daily_rate_operational !== null
                      ? `${analysis.historical_daily_rate_operational.toLocaleString('en-US')} ${analysis.unit}/hari`
                      : 'N/A'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">Laju Wajib (Op):</span>
                  <span className="font-mono font-semibold text-rose-700">
                    {analysis.required_daily_rate_operational !== null
                      ? `${analysis.required_daily_rate_operational.toLocaleString('en-US')} ${analysis.unit}/hari`
                      : 'N/A'}
                  </span>
                </div>
                {analysis.stated_capacity_per_day !== null && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">Kapasitas Max Normal:</span>
                    <span className="font-mono font-semibold text-amber-800">
                      {analysis.stated_capacity_per_day.toLocaleString('en-US')} {analysis.unit}/hari ({analysis.stated_capacity_source_ref})
                    </span>
                  </div>
                )}
                <div className="flex justify-between pt-1 border-t border-slate-200">
                  <span className="text-slate-600">Proyeksi Selesai:</span>
                  <span className="font-mono font-bold text-slate-900">
                    {analysis.projected_completion_date_operational ?? 'Blocked / Unverified'}
                    {analysis.projected_slip_days_operational !== null &&
                      analysis.projected_slip_days_operational > 0 && (
                        <span className="text-rose-700 ml-1">
                          (+{analysis.projected_slip_days_operational}d)
                        </span>
                      )}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Step-by-Step Formula & Calculation Audit Table */}
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2.5 flex items-center gap-1.5">
            <Info className="w-3.5 h-3.5" /> Rincian Langkah Perhitungan Deadline (Step-by-Step Audit)
          </h4>
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600">
                  <th className="py-2 px-3 font-semibold w-10">#</th>
                  <th className="py-2 px-3 font-semibold w-52">Tahap Perhitungan</th>
                  <th className="py-2 px-3 font-semibold">Rumus</th>
                  <th className="py-2 px-3 font-semibold">Substitusi Angka Aktual</th>
                  <th className="py-2 px-3 font-semibold">Hasil & Interpretasi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {analysis.calculation_steps.map((s) => (
                  <tr key={s.step} className="hover:bg-slate-50/70 align-top">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-400">{s.step}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{s.label}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">{s.formula}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-700">{s.substitution}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{s.result}</div>
                      {s.note && <div className="text-[11px] text-slate-500 mt-0.5">{s.note}</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
