import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  History,
  Plus,
  ShieldCheck,
} from 'lucide-react';
import { useState } from 'react';
import { createFollowUp, updateFollowUp, verifyFollowUp } from '../api';
import type {
  ActivePersona,
  AttentionSignal,
  FollowUpActionStatus,
  FollowUpRecord,
  TimelineEvent,
} from '../types';
import { FollowUpStatusBadge, VerificationStatusBadge } from './Badges';

interface FollowUpPanelProps {
  projectId: string;
  defaultOwner: string;
  persona: ActivePersona;
  onSwitchToDirector: () => void;
  signals: AttentionSignal[];
  timeline: TimelineEvent[];
  followups: FollowUpRecord[];
  onMutated: () => Promise<void>;
}

export function FollowUpPanel({
  projectId,
  defaultOwner,
  persona,
  onSwitchToDirector,
  signals,
  timeline,
  followups,
  onMutated,
}: FollowUpPanelProps) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [owner, setOwner] = useState(defaultOwner);
  const [priority, setPriority] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('HIGH');
  const [dueDate, setDueDate] = useState('2026-10-08');
  const [linkedSignal, setLinkedSignal] = useState(signals[0]?.rule_code ?? '');
  const [selectedRefs, setSelectedRefs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Status update note state per followup_id
  const [statusNotes, setStatusNotes] = useState<Record<string, string>>({});
  const [verifyOpenId, setVerifyOpenId] = useState<string | null>(null);
  const [verifyEvidenceId, setVerifyEvidenceId] = useState('');
  const [verifyNote, setVerifyNote] = useState('');
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({});

  const allEvidenceIds = timeline.map((e) => ({
    id: e.event_id,
    label: `${e.event_id} (${e.layer === 'OPERATIONAL_EVIDENCE' ? 'OP' : 'UPD'} • ${e.timestamp.slice(5, 16)})`,
  }));

  function toggleRef(refId: string) {
    setSelectedRefs((prev) =>
      prev.includes(refId) ? prev.filter((x) => x !== refId) : [...prev, refId]
    );
  }

  const actorLabel =
    persona.role === 'DIRECTOR' ? 'Director (Management)' : `${persona.name} (PIC)`;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await createFollowUp(
        {
          project_id: projectId,
          title: title.trim(),
          description: description.trim(),
          owner: owner.trim(),
          priority,
          due_date: dueDate ? dueDate : null,
          linked_signal_code: linkedSignal || null,
          evidence_refs: selectedRefs,
          actor: actorLabel,
        },
        persona
      );
      setTitle('');
      setDescription('');
      setSelectedRefs([]);
      setShowForm(false);
      await onMutated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(fu: FollowUpRecord, nextStatus: FollowUpActionStatus) {
    setError(null);
    setSubmitting(true);
    try {
      await updateFollowUp(
        fu.followup_id,
        {
          action_status: nextStatus,
          note: statusNotes[fu.followup_id] || undefined,
          actor: actorLabel,
        },
        persona
      );
      setStatusNotes((prev) => ({ ...prev, [fu.followup_id]: '' }));
      await onMutated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifySubmit(e: React.FormEvent, fuId: string) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await verifyFollowUp(
        fuId,
        {
          source_record_id: verifyEvidenceId,
          note: verifyNote.trim(),
          actor: actorLabel,
        },
        persona
      );
      setVerifyOpenId(null);
      setVerifyEvidenceId('');
      setVerifyNote('');
      await onMutated();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <ClipboardCheck className="w-5 h-5 text-slate-700" />
          <div>
            <h3 className="text-sm font-bold text-slate-900">
              Follow-Up Workflow & Evidence-Based Closure ({followups.length})
            </h3>
            <p className="text-xs text-slate-500">
              Tersimpan persisten di SQLite. Menutup tindakan (RESOLVED) tidak otomatis memverifikasi masalah operasional selesai.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer"
        >
          <Plus className="w-3.5 h-3.5" />
          {showForm ? 'Tutup Form' : 'Buat Follow-Up'}
        </button>
      </div>

      <div className="p-5 space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-800 font-medium">
            {error}
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleCreate}
            className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Judul Tindakan *
                </label>
                <input
                  required
                  minLength={3}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Contoh: Eskalasi credential production ke PIC customer"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PIC / Owner *</label>
                  <input
                    required
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Prioritas</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW')}
                    className="w-full px-2 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="HIGH">HIGH</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="LOW">LOW</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Due Date</label>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full px-2 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Deskripsi & Target Verifikasi *
              </label>
              <textarea
                required
                minLength={3}
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Jelaskan tindakan konkret dan bukti operasional apa yang diharapkan setelah selesai..."
                className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tautkan ke Sinyal Perhatian (Opsional)
                </label>
                <select
                  value={linkedSignal}
                  onChange={(e) => setLinkedSignal(e.target.value)}
                  className="w-full px-2.5 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                >
                  <option value="">-- Tidak ditautkan --</option>
                  {signals.map((s) => (
                    <option key={s.signal_id} value={s.rule_code}>
                      [{s.severity}] {s.rule_code} — {s.title.slice(0, 60)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Rujukan Bukti Terkait ({selectedRefs.length} dipilih)
                </label>
                <div className="max-h-24 overflow-y-auto p-2 bg-white border border-slate-300 rounded-lg flex flex-wrap gap-1.5">
                  {allEvidenceIds.map((item) => {
                    const active = selectedRefs.includes(item.id);
                    return (
                      <button
                        type="button"
                        key={item.id}
                        onClick={() => toggleRef(item.id)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono border cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-slate-900 text-white hover:bg-slate-800 disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Menyimpan...' : 'Simpan Follow-Up'}
              </button>
            </div>
          </form>
        )}

        {followups.length === 0 ? (
          <div className="text-center py-8 border border-dashed border-slate-300 rounded-lg text-xs text-slate-500">
            Belum ada catatan tindak lanjut untuk proyek ini. Klik <strong>Buat Follow-Up</strong> untuk mencatat aksi, owner, dan rujukan bukti.
          </div>
        ) : (
          <div className="space-y-3">
            {followups.map((fu) => (
              <div
                key={fu.followup_id}
                className="border border-slate-200 rounded-xl p-4 bg-white space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-[11px] text-slate-500">{fu.followup_id}</span>
                      <FollowUpStatusBadge status={fu.action_status} />
                      <VerificationStatusBadge status={fu.verification_status} />
                      <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-medium">
                        Priority: {fu.priority}
                      </span>
                    </div>
                    <h4 className="text-sm font-bold text-slate-900 mt-1">{fu.title}</h4>
                    <p className="text-xs text-slate-600 mt-0.5">{fu.description}</p>
                  </div>
                  <div className="text-right text-xs text-slate-600 space-y-0.5">
                    <div>
                      Owner: <span className="font-semibold text-slate-900">{fu.owner}</span>
                    </div>
                    {fu.due_date && (
                      <div>
                        Due: <span className="font-mono font-medium">{fu.due_date}</span>
                      </div>
                    )}
                    {fu.linked_signal_code && (
                      <div className="font-mono text-[10px] text-slate-500">
                        Signal: {fu.linked_signal_code}
                      </div>
                    )}
                  </div>
                </div>

                {fu.evidence_refs.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                    <span className="text-slate-500 font-medium">Rujukan awal:</span>
                    {fu.evidence_refs.map((r) => (
                      <span
                        key={r}
                        className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-slate-700"
                      >
                        {r}
                      </span>
                    ))}
                  </div>
                )}

                {/* Section 11: Explicit Evidence-Based Closure Banner */}
                {fu.action_status === 'RESOLVED' &&
                  fu.verification_status === 'AWAITING_EVIDENCE' && (
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div>
                          <div className="font-bold">
                            Action Closed ≠ Operational Issue Resolved (Section 11 Policy)
                          </div>
                          <p className="text-amber-900 mt-0.5">
                            Tindakan ditandai RESOLVED pada{' '}
                            <span className="font-mono">{fu.resolved_at?.slice(0, 19)}</span>, namun
                            masalah operasional tetap dianggap <strong>BELUM TERVERIFIKASI</strong>{' '}
                            sampai ada bukti operasional baru (Production Data) dengan timestamp
                            pasca-penyelesaian.
                          </p>
                        </div>
                      </div>

                      {persona.role === 'PIC' ? (
                        <div className="p-2.5 rounded-lg bg-white/80 border border-amber-200 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-950">
                          <span>
                            <strong>Separation of Duties (RBAC):</strong> Mode PIC dapat menutup aksi
                            hingga <code>RESOLVED</code>, sedangkan verifikasi penutupan isu berbasis
                            bukti operasional baru disetujui oleh <strong>Director / Management</strong>.
                          </span>
                          <button
                            type="button"
                            onClick={onSwitchToDirector}
                            className="px-2.5 py-1 rounded bg-slate-900 text-white font-semibold hover:bg-slate-800 cursor-pointer shrink-0"
                          >
                            Beralih ke Mode Director
                          </button>
                        </div>
                      ) : verifyOpenId === fu.followup_id ? (
                        <form
                          onSubmit={(e) => handleVerifySubmit(e, fu.followup_id)}
                          className="p-3 bg-white rounded-lg border border-amber-200 space-y-2"
                        >
                          {fu.eligible_verification_records.length === 0 ? (
                            <p className="text-rose-700 font-medium">
                              Belum ada record Production Data baru dengan timestamp ≥{' '}
                              {fu.resolved_at?.slice(0, 19)}. Gunakan <strong>Data Refresh / Live Ingest</strong> di
                              kanan atas untuk memasukkan bukti operasional terbaru terlebih dahulu.
                            </p>
                          ) : (
                            <>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Pilih Bukti Operasional Pasca-Penyelesaian *
                                </label>
                                <select
                                  required
                                  value={verifyEvidenceId}
                                  onChange={(e) => setVerifyEvidenceId(e.target.value)}
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                                >
                                  <option value="">-- Pilih source_record_id --</option>
                                  {fu.eligible_verification_records.map((rec) => (
                                    <option key={rec.ref_id} value={rec.ref_id}>
                                      {rec.ref_id} ({rec.timestamp}) — {rec.excerpt}
                                    </option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="block font-semibold text-slate-700 mb-1">
                                  Catatan Verifikasi Bukti *
                                </label>
                                <input
                                  required
                                  minLength={3}
                                  value={verifyNote}
                                  onChange={(e) => setVerifyNote(e.target.value)}
                                  placeholder="Contoh: Koneksi production terkonfirmasi CONNECTED pada snapshot terbaru."
                                  className="w-full px-2.5 py-1.5 border border-slate-300 rounded text-xs"
                                />
                              </div>
                              <div className="flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setVerifyOpenId(null)}
                                  className="px-2.5 py-1 text-slate-600 cursor-pointer"
                                >
                                  Batal
                                </button>
                                <button
                                  type="submit"
                                  disabled={submitting}
                                  className="px-3 py-1 bg-teal-700 text-white rounded font-semibold hover:bg-teal-800 cursor-pointer"
                                >
                                  Verifikasi dengan Bukti
                                </button>
                              </div>
                            </>
                          )}
                        </form>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setVerifyOpenId(fu.followup_id);
                            setVerifyEvidenceId(fu.eligible_verification_records[0]?.ref_id ?? '');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-900 text-white font-semibold hover:bg-amber-800 cursor-pointer"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                          Tautkan Bukti Operasional Baru ({fu.eligible_verification_records.length} tersedia)
                        </button>
                      )}
                    </div>
                  )}

                {fu.verification_status === 'VERIFIED_BY_EVIDENCE' && (
                  <div className="p-2.5 rounded-lg bg-teal-50 border border-teal-200 text-xs text-teal-900 flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-teal-700 shrink-0 mt-0.5" />
                    <div>
                      <strong>Terverifikasi oleh Bukti Operasional:</strong>{' '}
                      <span className="font-mono font-semibold">{fu.verification_evidence_ref}</span> —{' '}
                      {fu.verification_note}
                    </div>
                  </div>
                )}

                {/* Status transition controls */}
                <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    <input
                      type="text"
                      value={statusNotes[fu.followup_id] ?? ''}
                      onChange={(e) =>
                        setStatusNotes((prev) => ({ ...prev, [fu.followup_id]: e.target.value }))
                      }
                      placeholder="Catatan perubahan status (opsional)..."
                      className="px-2.5 py-1 text-xs border border-slate-200 rounded-md w-56 focus:outline-none focus:ring-1 focus:ring-slate-400"
                    />
                    {(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CANCELLED'] as FollowUpActionStatus[]).map(
                      (st) => (
                        <button
                          key={st}
                          type="button"
                          disabled={submitting || fu.action_status === st}
                          onClick={() => handleStatusChange(fu, st)}
                          className={`px-2.5 py-1 rounded text-[11px] font-semibold border cursor-pointer transition ${
                            fu.action_status === st
                              ? 'bg-slate-900 text-white border-slate-900 cursor-default'
                              : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                          }`}
                        >
                          {st.replace('_', ' ')}
                        </button>
                      )
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      setExpandedHistory((prev) => ({
                        ...prev,
                        [fu.followup_id]: !prev[fu.followup_id],
                      }))
                    }
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                  >
                    <History className="w-3.5 h-3.5" />
                    Riwayat ({fu.history.length})
                  </button>
                </div>

                {expandedHistory[fu.followup_id] && (
                  <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Audit Trail Status Follow-Up
                    </div>
                    {fu.history.map((h) => (
                      <div
                        key={h.history_id}
                        className="text-xs flex flex-wrap justify-between gap-2 border-b border-slate-200/70 pb-1.5 last:border-0 last:pb-0"
                      >
                        <div>
                          <span className="font-mono font-semibold text-slate-800">
                            {h.from_status ? `${h.from_status} → ` : ''}
                            {h.to_status}
                          </span>{' '}
                          <span className="text-slate-500">({h.verification_status})</span>
                          <div className="text-slate-600">{h.note}</div>
                          {h.evidence_ref && (
                            <span className="font-mono text-[11px] text-teal-700">
                              Evidence: {h.evidence_ref}
                            </span>
                          )}
                        </div>
                        <div className="text-right text-[11px] text-slate-500 font-mono">
                          <div>{h.actor}</div>
                          <div>{h.changed_at.slice(0, 19).replace('T', ' ')}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
