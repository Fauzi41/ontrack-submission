import { useCallback, useEffect, useState } from 'react';
import { ApiError, LABEL, type ReviewItem, type ReviewQueue, decideReview, getReviewQueue, when } from '../api';

const KIND: Record<string, string> = {
  DISPUTED: 'Bantahan',
  EXPLAINED: 'Penjelasan',
  ACKNOWLEDGED: 'Pengakuan',
};

/**
 * Antrean tinjauan: tempat bantahan dan penjelasan dari PIC berhenti sampai
 * ada manusia yang memutuskan. Keputusan tidak mengubah severity mesin, karena
 * yang dicatat di sini adalah penilaian orang, bukan angka baru.
 */
export default function ReviewView({ onOpen }: { onOpen: (id: string) => void }) {
  const [data, setData] = useState<ReviewQueue | null>(null);
  const [notes, setNotes] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState<number | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await getReviewQueue());
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function decide(item: ReviewItem, decision: 'UPHELD' | 'DENIED') {
    setBusy(item.id);
    setError(null);
    setMessage(null);
    try {
      const res = await decideReview(item.id, { decision, note: notes[item.id] ?? '' });
      setMessage(
        `${decision === 'UPHELD' ? 'Bantahan diterima' : 'Bantahan ditolak'} untuk ${item.project_id}. Severity temuan tidak diubah. Sisa antrean: ${res.queue_remaining}.`,
      );
      setNotes((prev) => ({ ...prev, [item.id]: '' }));
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? `${e.code}: ${e.message}` : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  if (error) return <div className="banner err">{error}</div>;
  if (!data) return <p className="hint">Memuat antrean…</p>;

  return (
    <section className="review">
      <div className="card">
        <h2>Tinjauan</h2>
        <p className="hint">
          Bantahan dan penjelasan dari PIC berhenti di sini sampai ada keputusan manusia. Keputusan dicatat
          bersama alasannya, dan tidak mengubah severity yang dihitung mesin.
        </p>
        <div className="facts">
          <div className="fact">
            <span className="label">menunggu</span>
            <strong>{data.total}</strong>
          </div>
          <div className="fact">
            <span className="label">bantahan</span>
            <strong>{data.counts.DISPUTED ?? 0}</strong>
          </div>
          <div className="fact">
            <span className="label">penjelasan</span>
            <strong>{data.counts.EXPLAINED ?? 0}</strong>
          </div>
        </div>
        {message && <div className="banner ok">{message}</div>}
      </div>

      {data.total === 0 && (
        <div className="card">
          <p className="hint">
            Tidak ada yang menunggu tinjauan. Bantahan dan penjelasan yang dikirim dari halaman proyek akan muncul di
            sini.
          </p>
        </div>
      )}

      {data.queue.map((item) => (
        <article className="card review-item" key={item.id}>
          <header>
            <button className="link" onClick={() => onOpen(item.project_id)}>
              {item.project_id} {item.project_name}
            </button>
            <span className={`chip sev-${item.severity ?? 'info'}`}>{LABEL.severity[item.severity ?? 'info']}</span>
            <span className="tag">{KIND[item.kind] ?? item.kind}</span>
          </header>
          <p className="detector">{item.detector ? (LABEL.detector[item.detector] ?? item.detector) : item.fingerprint}</p>
          <blockquote>{item.note}</blockquote>
          <p className="hint">
            {item.actor} · {when(item.created_at)}
            {item.evidence_ref ? ` · bukti ${item.evidence_ref}` : ''}
            {item.issue_status ? ` · isu ${LABEL.issue[item.issue_status] ?? item.issue_status}` : ''}
          </p>
          <label className="review-note">
            <span>Alasan keputusan</span>
            <textarea
              rows={2}
              value={notes[item.id] ?? ''}
              onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
              placeholder="Sebutkan dasar keputusannya, misalnya record mana yang diperiksa."
            />
          </label>
          <div className="review-actions">
            <button
              className="primary"
              disabled={busy === item.id || (notes[item.id] ?? '').trim().length < 3}
              onClick={() => void decide(item, 'UPHELD')}
            >
              Terima bantahan
            </button>
            <button
              disabled={busy === item.id || (notes[item.id] ?? '').trim().length < 3}
              onClick={() => void decide(item, 'DENIED')}
            >
              Tolak bantahan
            </button>
          </div>
        </article>
      ))}
    </section>
  );
}
