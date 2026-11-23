import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  LABEL,
  addResponse,
  createFollowup,
  day,
  getProject,
  num,
  setIssueStatus,
  updateFollowup,
  when,
  type Finding,
  type ProjectDetail,
} from '../api';

interface Props {
  projectId: string;
  onBack: () => void;
}

export default function ProjectView({ projectId, onBack }: Props) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await getProject(projectId));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const findings = useMemo(() => detail?.findings ?? [], [detail]);
  const issueByFingerprint = useMemo(
    () => new Map((detail?.issues ?? []).map((i) => [i.fingerprint, i])),
    [detail],
  );

  async function act(fn: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setNotice(success);
      await load();
    } catch (e) {
      setNotice(null);
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (error && !detail) return <div className="banner err">{error}</div>;
  if (!detail) return <p className="hint">Memuat {projectId}…</p>;

  const progress = detail.progress;

  return (
    <>
      <div className="crumb">
        <button onClick={onBack}>Portofolio</button>
        <span className="hint">detail proyek</span>
      </div>

      <section className="panel">
        <div className="panel-head">
          <div>
            <h1>
              <code>{detail.project_id}</code> <span>{detail.project_name}</span>
            </h1>
            <p className="sub">
              {detail.customer} · PIC {detail.pic ?? 'tidak dicatat'} · {detail.project_type} · status {detail.lifecycle}
            </p>
          </div>
          <div className="asof">
            <span className="label">deadline</span>
            <strong>{day(detail.deadline)}</strong>
            <span className={`chip time-${detail.time_pressure.toLowerCase()}`}>{LABEL.time[detail.time_pressure]}</span>
          </div>
        </div>

        {error && <div className="banner err">{error}</div>}
        {notice && <div className="banner ok">{notice}</div>}

        <div className="facts">
          <Fact label="Target" value={`${num(progress.target)} ${progress.unit ?? ''}`} />
          <Fact label="Dilaporkan" value={num(progress.reported)} note={`${num(progress.pct_reported, 1)}% menurut laporan`} />
          <Fact
            label="Tervalidasi"
            value={progress.validated === null ? 'tidak ada' : num(progress.validated)}
            note={`${num(progress.pct_calculated, 1)}% dihitung dari bukti`}
          />
          <Fact label="Sisa hari" value={detail.days_remaining === null ? '—' : num(detail.days_remaining, 1)} />
        </div>

        <p className="narrative">{detail.narrative}</p>
        {detail.notes.map((note) => (
          <p key={note} className="hint">Catatan: {note}</p>
        ))}
        <p className="hint">
          Basis progress untuk tipe ini: {LABEL.basis[progress.basis] ?? progress.basis}. Dua angka di atas boleh berbeda;
          selisihnya justru yang dinilai.
        </p>
      </section>

      {detail.groups.length > 0 && (
        <section className="panel">
          <div className="panel-head">
            <h2>Kelompok temuan</h2>
            <span className="hint">Beberapa detektor yang menunjuk bukti yang sama digabung agar tidak dihitung dua kali.</span>
          </div>
          <div className="stack">
            {detail.groups.map((g) => (
              <div key={g.group_key} className="group">
                <span className={`chip sev-${g.severity}`}>{LABEL.severity[g.severity]}</span>
                <strong>{g.title}</strong>
                <span className="hint">{g.member_fingerprints.length} temuan · bukti {g.group_key}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <div className="panel-head">
          <h2>Temuan dan buktinya</h2>
          <span className="hint">Setiap temuan menyebut record sumber yang bisa dibuka di data, bukan hanya kesimpulan.</span>
        </div>
        <div className="stack">
          {findings.map((f) => (
            <FindingCard key={f.fingerprint} finding={f} issueStatus={issueByFingerprint.get(f.fingerprint)?.status} />
          ))}
          {findings.length === 0 && <p className="hint">Tidak ada temuan untuk proyek ini.</p>}
        </div>
      </section>

      <section className="panel">
        <div className="panel-head">
          <h2>Isu</h2>
          <span className="hint">
            Menunggu bukti bukan berarti beres. Penutupan butuh record sumber yang masuk setelah isu dibuka.
          </span>
        </div>
        <div className="stack">
          {detail.issues.map((issue) => (
            <IssueRow
              key={issue.id}
              id={issue.id}
              status={issue.status}
              detector={issue.detector_key}
              fingerprint={issue.fingerprint}
              resolvedBy={issue.resolved_by_record}
              reopenCount={issue.reopen_count}
              disabled={busy}
              onAwait={() => act(() => setIssueStatus(issue.id, 'AWAITING_EVIDENCE'), 'Isu ditandai menunggu bukti.')}
              onClose={(ref) =>
                act(() => setIssueStatus(issue.id, 'VERIFIED_RESOLVED', ref), `Isu ditutup dengan bukti ${ref}.`)
              }
            />
          ))}
          {detail.issues.length === 0 && <p className="hint">Belum ada isu. Impor akan membukanya dari temuan.</p>}
        </div>
      </section>

      <FollowupPanel
        projectId={detail.project_id}
        followups={detail.followups}
        fingerprints={findings.map((f) => f.fingerprint)}
        disabled={busy}
        onCreate={(body) => act(() => createFollowup(detail.project_id, body), 'Follow-up dibuat.')}
        onStatus={(id, status) => act(() => updateFollowup(id, { status, note: 'diubah dari UI' }), `Status ${status} dicatat. Isu tidak berubah.`)}
      />

      <ResponsePanel
        projectId={detail.project_id}
        fingerprints={findings.map((f) => f.fingerprint)}
        responses={detail.responses}
        disabled={busy}
        onSend={(fingerprint, kind, note) => act(() => addResponse(detail.project_id, fingerprint, { kind, note }), 'Tanggapan tersimpan untuk ditinjau.')}
      />
    </>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="fact">
      <span className="label">{label}</span>
      <strong>{value}</strong>
      {note && <span className="hint">{note}</span>}
    </div>
  );
}

function FindingCard({ finding, issueStatus }: { finding: Finding; issueStatus?: string }) {
  return (
    <article className={`finding sev-border-${finding.severity_final}`}>
      <div className="finding-head">
        <span className={`chip sev-${finding.severity_final}`}>{LABEL.severity[finding.severity_final]}</span>
        <strong>{LABEL.detector[finding.detector] ?? finding.detector}</strong>
        <span className="hint">keyakinan {LABEL.confidence[finding.confidence]}</span>
        {finding.borderline && <span className="chip borderline">borderline</span>}
        {issueStatus && <span className={`chip issue-${issueStatus.toLowerCase()}`}>{LABEL.issue[issueStatus]}</span>}
      </div>
      <p>{finding.reason}</p>
      {finding.evidence.length > 0 && (
        <div className="evidence">
          {finding.evidence.map((e) => (
            <span key={e.ref_id} className="ev">
              <code>{e.ref_id}</code>
              <span>{e.label} · {e.source_kind.toLowerCase()} · {e.provenance.toLowerCase()} · {when(e.observed_at)}</span>
            </span>
          ))}
        </div>
      )}
      {finding.unknowns.length > 0 && (
        <ul className="unknowns">
          {finding.unknowns.map((u) => (
            <li key={u}>{u}</li>
          ))}
        </ul>
      )}
      <p className="action">
        Saran: {finding.action} <span className="hint">({LABEL.owner[finding.owner] ?? finding.owner})</span>
      </p>
    </article>
  );
}

function IssueRow(props: {
  id: number;
  status: string;
  detector: string;
  fingerprint: string;
  resolvedBy: string | null;
  reopenCount: number;
  disabled: boolean;
  onAwait: () => void;
  onClose: (ref: string) => void;
}) {
  const [ref, setRef] = useState('');
  return (
    <div className="issue">
      <div className="issue-head">
        <span className={`chip issue-${props.status.toLowerCase()}`}>{LABEL.issue[props.status] ?? props.status}</span>
        <code>#{props.id}</code>
        <span>{LABEL.detector[props.detector] ?? props.detector}</span>
        {props.reopenCount > 0 && <span className="hint">dibuka ulang {props.reopenCount}x</span>}
        {props.resolvedBy && <span className="hint">bukti: <code>{props.resolvedBy}</code></span>}
      </div>
      <div className="issue-actions">
        <button onClick={props.onAwait} disabled={props.disabled}>
          Menunggu bukti
        </button>
        <input
          placeholder="record bukti, misal PROD-XXX-001"
          value={ref}
          onChange={(e) => setRef(e.target.value)}
          size={28}
        />
        <button onClick={() => props.onClose(ref.trim())} disabled={props.disabled || ref.trim().length === 0}>
          Tutup dengan bukti
        </button>
      </div>
    </div>
  );
}

function FollowupPanel(props: {
  projectId: string;
  followups: ProjectDetail['followups'];
  fingerprints: string[];
  disabled: boolean;
  onCreate: (body: { title: string; owner: string; due_date?: string | null; fingerprint?: string | null }) => void;
  onStatus: (id: string, status: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');
  const [due, setDue] = useState('');
  const [fingerprint, setFingerprint] = useState('');

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Follow-up</h2>
        <span className="hint">
          Follow-up mencatat aksi. Selesai di sini tidak menutup isu, karena penutupan butuh bukti.
        </span>
      </div>

      <div className="form">
        <input placeholder="judul aksi" value={title} onChange={(e) => setTitle(e.target.value)} size={30} />
        <input placeholder="pemilik" value={owner} onChange={(e) => setOwner(e.target.value)} size={14} />
        <input placeholder="YYYY-MM-DD" value={due} onChange={(e) => setDue(e.target.value)} size={12} />
        <select value={fingerprint} onChange={(e) => setFingerprint(e.target.value)}>
          <option value="">tanpa temuan</option>
          {props.fingerprints.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <button
          disabled={props.disabled || title.trim().length < 4 || owner.trim().length === 0}
          onClick={() => {
            props.onCreate({ title, owner, due_date: due || null, fingerprint: fingerprint || null });
            setTitle('');
            setOwner('');
            setDue('');
            setFingerprint('');
          }}
        >
          Tambah
        </button>
      </div>

      <div className="stack">
        {props.followups.map((f) => (
          <div key={f.id} className="issue">
            <div className="issue-head">
              <span className={`chip issue-${f.status.toLowerCase()}`}>{f.status}</span>
              <strong>{f.title}</strong>
              <span className="hint">{f.owner} · jatuh tempo {day(f.due_date)}</span>
            </div>
            <div className="issue-actions">
              <button onClick={() => props.onStatus(f.id, 'IN_PROGRESS')} disabled={props.disabled}>Mulai</button>
              <button onClick={() => props.onStatus(f.id, 'DONE')} disabled={props.disabled}>Selesai</button>
              <button onClick={() => props.onStatus(f.id, 'CANCELLED')} disabled={props.disabled}>Batalkan</button>
            </div>
          </div>
        ))}
        {props.followups.length === 0 && <p className="hint">Belum ada follow-up untuk proyek ini.</p>}
      </div>
    </section>
  );
}

function ResponsePanel(props: {
  projectId: string;
  fingerprints: string[];
  responses: ProjectDetail['responses'];
  disabled: boolean;
  onSend: (fingerprint: string, kind: string, note: string) => void;
}) {
  const [fingerprint, setFingerprint] = useState(props.fingerprints[0] ?? '');
  const [kind, setKind] = useState('DISPUTED');
  const [note, setNote] = useState('');

  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Tanggapan tim</h2>
        <span className="hint">Kalau temuan salah, bantah dengan alasan. Tanggapan disimpan terpisah dari status isu.</span>
      </div>

      <div className="form">
        <select value={fingerprint} onChange={(e) => setFingerprint(e.target.value)}>
          {props.fingerprints.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          <option value="DISPUTED">Bantah</option>
          <option value="ACKNOWLEDGED">Akui</option>
          <option value="EXPLAINED">Jelaskan</option>
        </select>
        <input placeholder="alasan, minimal 3 karakter" value={note} onChange={(e) => setNote(e.target.value)} size={40} />
        <button
          disabled={props.disabled || note.trim().length < 3 || fingerprint === ''}
          onClick={() => {
            props.onSend(fingerprint, kind, note);
            setNote('');
          }}
        >
          Kirim
        </button>
      </div>

      <div className="stack">
        {props.responses.map((r) => (
          <div key={r.id} className="group">
            <span className="chip">{r.kind}</span>
            <span className="hint">{when(r.created_at)}</span>
            <span>{r.note}</span>
            <code>{r.fingerprint}</code>
          </div>
        ))}
        {props.responses.length === 0 && <p className="hint">Belum ada tanggapan.</p>}
      </div>
    </section>
  );
}
