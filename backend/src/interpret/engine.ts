import { buildContext, fmt, parseTs } from './context.js';
import { DETECTORS } from './detectors.js';
import type {
  Confidence,
  Finding,
  FindingGroup,
  Portfolio,
  ProjectAssessment,
  ProjectFacts,
  Severity,
} from './types.js';
import { CONFIDENCE_ORDER, SEVERITY_ORDER, TIME_ORDER } from './types.js';

const DETECTOR_LABEL: Record<string, string> = {
  progress_gap: 'Progress dilaporkan melebihi bukti',
  source_conflict: 'Dua sumber berbeda angka',
  stale_report: 'Laporan berhenti masuk',
  stale_evidence: 'Bukti operasional berhenti masuk',
  blocked_dependency: 'Tertahan dependency eksternal',
  schedule_risk: 'Laju tidak cukup untuk deadline',
  quality_gap: 'Pekerjaan tidak masuk hitungan target',
  capacity_degradation: 'Kapasitas turun',
  closure_evidence_missing: 'Klaim selesai tanpa bukti',
  verified_closure: 'Selesai dan terbukti',
  internal_inconsistency: 'Angka di satu baris tidak cocok',
  status_contradiction: 'Status bertentangan dengan angka',
  progress_basis_conflict: 'Definisi progress tidak sesuai tipe proyek',
  deadline_passed: 'Deadline lewat, belum selesai',
};

/** Confidence rendah menahan severity critical: klaim besar dengan bukti tipis
 *  tidak boleh memimpin daftar. */
export function adjust(f: Finding): Finding {
  if (f.severity === 'critical' && f.confidence === 'low') {
    return { ...f, severity_final: 'attention' };
  }
  return f;
}

function groupFindings(findings: Finding[]): FindingGroup[] {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    const p = parent.get(k) ?? k;
    if (p === k) return k;
    const root = find(p);
    parent.set(k, root);
    return root;
  };
  const union = (a: string, b: string): void => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  for (const f of findings) parent.set(f.fingerprint, f.fingerprint);
  const byRef = new Map<string, string>();
  for (const f of findings) {
    for (const e of f.evidence) {
      const seen = byRef.get(e.ref_id);
      if (seen) union(seen, f.fingerprint);
      else byRef.set(e.ref_id, f.fingerprint);
    }
  }

  const buckets = new Map<string, Finding[]>();
  for (const f of findings) {
    const root = find(f.fingerprint);
    const list = buckets.get(root);
    if (list) list.push(f);
    else buckets.set(root, [f]);
  }

  const groups: FindingGroup[] = [];
  for (const [root, members] of buckets) {
    if (members.length < 2) continue;
    const top = members.reduce((a, b) => (SEVERITY_ORDER[b.severity_final] > SEVERITY_ORDER[a.severity_final] ? b : a));
    // Judul kelompok harus menyebut semua masalah yang ada di dalamnya. Kalau hanya
    // memakai anggota terkuat, kelompok PRJ-003 tampil sebagai "laporan berhenti masuk"
    // padahal isinya juga soal angka yang tidak cocok.
    const keys = [top.detector, ...members.map((m) => m.detector).filter((d) => d !== top.detector)];
    groups.push({
      group_key: root,
      title: [...new Set(keys)].map((k) => DETECTOR_LABEL[k] ?? k).join(' / '),
      severity: top.severity_final,
      member_fingerprints: members.map((m) => m.fingerprint),
    });
    for (const m of members) m.group_key = root;
  }
  return groups;
}

function narrativeFor(top: Finding | undefined, lifecycle: string): string {
  if (!top) return 'Tidak ada masalah yang bisa dibuktikan dari data yang tersimpan.';
  if (top.severity_final === 'info') return `${top.reason} Tidak ada tindakan yang diminta.`;
  return top.reason;
}

export function evaluateProject(facts: ProjectFacts): ProjectAssessment {
  const ctx = buildContext(facts);
  const raw = DETECTORS.flatMap((d) => d(ctx)).map(adjust);

  const realistic = raw.filter((f) => f.severity_final !== 'info');
  const ranked = [...realistic].sort(
    (a, b) =>
      SEVERITY_ORDER[b.severity_final] - SEVERITY_ORDER[a.severity_final] ||
      TIME_ORDER[b.time_pressure] - TIME_ORDER[a.time_pressure] ||
      CONFIDENCE_ORDER[b.confidence] - CONFIDENCE_ORDER[a.confidence],
  );
  const ordered = [...ranked, ...raw.filter((f) => f.severity_final === 'info')];

  const groups = groupFindings(ordered);
  const top = ordered[0];

  const pct = ctx.facts.project.reported_progress_pct;
  const target = ctx.facts.project.target;
  const notes: string[] = [];
  if (facts.rule.rate_model !== 'flow') {
    notes.push('Laju harian tidak dihitung: pekerjaan ini bertipe diskrit, angka rata-rata per hari tidak bermakna.');
  }
  if (facts.rule.progress_basis === 'accepted_in_production') {
    notes.push('Progress dihitung dari yang diterima di production, bukan dari pekerjaan yang sudah selesai.');
  }
  if (!facts.project.deadline) {
    notes.push('Tidak ada deadline, jadi tekanan waktu tidak bisa dinilai.');
  }

  return {
    project_id: facts.project.project_id,
    project_name: facts.project.project_name,
    project_type: facts.project.project_type,
    customer: facts.project.customer,
    pic: facts.project.pic,
    lifecycle: ctx.lifecycle,
    deadline: facts.project.deadline,
    time_pressure: ctx.timePressure,
    days_remaining: ctx.remainingDays,
    progress: {
      target,
      unit: facts.project.target_unit,
      reported: ctx.reported,
      validated: ctx.validated,
      pct_reported: pct,
      // Persentase ini dipakai untuk menunjukkan selisih antara yang dilaporkan
      // dan yang bisa dibuktikan. Kalau diisi dari angka laporan, ia hanya
      // menyalin pct_reported dan selisihnya selalu nol.
      pct_calculated: target && ctx.validated !== null ? (ctx.validated / target) * 100 : null,
      basis: facts.rule.progress_basis,
    },
    findings: ordered,
    groups,
    top_severity: top?.severity_final ?? 'info',
    rank: null,
    tied: false,
    narrative: narrativeFor(top, ctx.lifecycle),
    notes,
  };
}

/** Urutan portofolio: severity, tekanan waktu, keyakinan, deadline terdekat,
 *  lalu selisih yang tidak terjelaskan. Seri pada kelima kunci itu ditampilkan
 *  sebagai peringkat sama, bukan dipaksa berurut. */
export function assemblePortfolio(asOf: string, factsList: ProjectFacts[]): Portfolio {
  const projects = factsList.map(evaluateProject);

  const gapOf = (p: ProjectAssessment): number => {
    const f = p.findings.find((x) => x.detector === 'progress_gap' || x.detector === 'schedule_risk');
    return f ? SEVERITY_ORDER[f.severity_final] : 0;
  };

  const sorted = [...projects].sort((a, b) => {
    const s = SEVERITY_ORDER[b.top_severity] - SEVERITY_ORDER[a.top_severity];
    if (s !== 0) return s;
    const t = TIME_ORDER[b.time_pressure] - TIME_ORDER[a.time_pressure];
    if (t !== 0) return t;
    const ca = Math.max(...a.findings.map((f) => CONFIDENCE_ORDER[f.confidence]), -1);
    const cb = Math.max(...b.findings.map((f) => CONFIDENCE_ORDER[f.confidence]), -1);
    if (cb !== ca) return cb - ca;
    const da = parseTs(a.deadline) ?? Number.MAX_SAFE_INTEGER;
    const db = parseTs(b.deadline) ?? Number.MAX_SAFE_INTEGER;
    if (da !== db) return da - db;
    const g = gapOf(b) - gapOf(a);
    if (g !== 0) return g;
    return a.project_id.localeCompare(b.project_id);
  });

  let rank = 0;
  let prevKey = '';
  sorted.forEach((p, i) => {
    const key = [p.top_severity, p.time_pressure, p.progress.pct_reported ?? ''].join('|');
    if (key !== prevKey) {
      rank = i + 1;
      prevKey = key;
    }
    p.rank = p.top_severity === 'info' ? null : rank;
  });

  // Seri ditandai di semua anggotanya, bukan hanya yang kebetulan di urutan kedua.
  const perRank = new Map<number, ProjectAssessment[]>();
  for (const p of sorted) {
    if (p.rank === null) continue;
    const list = perRank.get(p.rank);
    if (list) list.push(p);
    else perRank.set(p.rank, [p]);
  }
  for (const list of perRank.values()) {
    const tied = list.length > 1;
    for (const p of list) p.tied = tied;
  }

  const counts: Record<Severity, number> = { critical: 0, attention: 0, watch: 0, info: 0 };
  for (const p of projects) counts[p.top_severity] += 1;

  return { as_of: asOf, projects: sorted, counts };
}
