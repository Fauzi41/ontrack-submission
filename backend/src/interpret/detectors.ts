import type { Ctx } from './context.js';
import { fmt, UNIT_NOUN } from './context.js';
import type { Confidence, Evidence, Finding, OwnerRole, Severity } from './types.js';

interface Draft {
  detector: string;
  fingerprint?: string;
  severity: Severity;
  confidence: Confidence;
  method: string;
  reason: string;
  unknowns?: string[];
  evidence: Evidence[];
  action: string;
  owner?: OwnerRole;
  owner_reason?: string;
  borderline?: boolean;
}

const PM = 'PROJECT_MANAGER' as const;

function build(ctx: Ctx, d: Draft): Finding {
  const seen = new Set<string>();
  const evidence = d.evidence.filter((e) => {
    if (seen.has(e.ref_id)) return false;
    seen.add(e.ref_id);
    return true;
  });
  return {
    project_id: ctx.facts.project.project_id,
    detector: d.detector,
    fingerprint: `${d.detector}:${d.fingerprint ?? 'main'}`,
    severity: d.severity,
    severity_final: d.severity,
    confidence: d.confidence,
    method: d.method,
    reason: d.reason,
    unknowns: d.unknowns ?? [],
    evidence,
    action: d.action,
    owner: d.owner ?? PM,
    owner_reason: d.owner_reason ?? 'perbaikan bisa dilakukan di dalam kendali PM',
    borderline: d.borderline ?? false,
    time_pressure: ctx.timePressure,
    group_key: null,
  };
}

const noun = (unit: string | null): string => (unit ? (UNIT_NOUN[unit] ?? unit) : 'unit');

/* ---------------------------------------------------------------- D1 */
/** Progress yang dilaporkan vs kuantitas yang benar-benar tervalidasi.
 *  Selisih dibedakan menjadi "terjelaskan" (ada di antrean pemeriksaan)
 *  dan "tidak terjelaskan" (tidak ada sumber yang mengakuinya). */
export function progressGap(ctx: Ctx): Finding[] {
  if (ctx.facts.rule.progress_basis === 'accepted_in_production') return [];
  const { reported, validated, pending } = ctx;
  if (reported === null || validated === null) return [];
  const target = ctx.facts.project.target;
  const unit = ctx.facts.project.target_unit;
  const gap = reported - validated;
  const tolerance = Math.max((target ?? reported) * 0.005, 0.5);
  if (Math.abs(gap) <= tolerance) return [];

  const explained = gap > 0 ? Math.min(gap, pending ?? 0) : 0;
  const unexplained = gap - explained;
  const share = target ? unexplained / target : 0;
  const severity: Severity =
    unexplained <= 0 ? 'watch' : share > 0.05 ? 'critical' : share > 0.01 ? 'attention' : 'watch';

  const evidence = [
    ctx.ev(ctx.latest('reported_actual'), 'angka laporan di master'),
    ctx.ev(ctx.latest(ctx.validatedMetricName()), 'angka terverifikasi dari sistem operasional'),
  ];
  if (pending !== null && pending > 0) evidence.push(ctx.ev(ctx.latest('pending_internal_check_quantity'), 'antrean pemeriksaan'));

  const parts = [`Master mencatat ${fmt(reported)} ${noun(unit)}, bukti operasional ${fmt(validated)} ${noun(unit)}.`];
  if (explained > 0) parts.push(`Selisih ${fmt(explained)} sudah dijelaskan antrean pemeriksaan internal.`);
  if (unexplained > 0) parts.push(`Sisanya ${fmt(unexplained)} ${noun(unit)} tidak diakui sumber mana pun.`);

  return [
    build(ctx, {
      detector: 'progress_gap',
      severity,
      confidence: 'high',
      method: `gap = reported_actual - validated = ${fmt(reported)} - ${fmt(validated)} = ${fmt(gap)}`,
      reason: parts.join(' '),
      unknowns:
        unexplained > 0
          ? ['apakah angka master berasal dari hitungan tim lapangan yang belum masuk sistem']
          : [],
      evidence,
      action:
        unexplained > 0
          ? 'Rekonsiliasi angka master dengan sistem operasional sebelum laporan berikutnya.'
          : 'Pastikan antrean pemeriksaan punya tenggat, supaya selisih ini tidak menetap.',
    }),
  ];
}

/* ---------------------------------------------------------------- D2 */
/** Dua sumber memberi angka berbeda untuk ukuran yang sama, dan selisihnya
 *  tidak bisa dijelaskan. Sengaja tidak memilih pemenang. */
export function sourceConflict(ctx: Ctx): Finding[] {
  // Untuk proyek yang progress-nya dihitung dari penerimaan production, selisih
  // dibangun-vs-diterima bukan konflik sumber melainkan perbedaan definisi (D11).
  if (ctx.facts.rule.progress_basis === 'accepted_in_production') return [];
  const { reported, validated, pending } = ctx;
  if (reported === null || validated === null) return [];
  const unexplained = reported - validated - Math.min(Math.max(reported - validated, 0), pending ?? 0);
  if (unexplained <= 0) return [];
  const unit = ctx.facts.project.target_unit;
  const share = ctx.facts.project.target ? unexplained / ctx.facts.project.target : 0;

  return [
    build(ctx, {
      detector: 'source_conflict',
      severity: share > 0.1 ? 'critical' : 'attention',
      confidence: 'medium',
      method: 'dua sumber independen, satuan sama, selisih melebihi toleransi',
      reason: `Master dan sistem operasional berbeda ${fmt(unexplained)} ${noun(unit)} tanpa penjelasan. Keduanya tidak bisa benar sekaligus.`,
      unknowns: [
        'definisi mana yang dipakai masing-masing sumber (halaman diproses vs halaman diterima)',
        'apakah ada pemrosesan ulang yang terhitung dua kali',
      ],
      evidence: [
        ctx.ev(ctx.latest('reported_actual'), 'sumber A, laporan'),
        ctx.ev(ctx.latest(ctx.validatedMetricName()), 'sumber B, operasional'),
      ],
      action: 'Minta pemilik masing-masing sumber menjelaskan definisi angkanya, lalu tetapkan satu definisi resmi.',
    }),
  ];
}

/* ---------------------------------------------------------------- D3 */
/** Tidak ada laporan manusia atau tidak ada bukti operasional dalam jendela
 *  yang wajar. Dua-duanya bisa terjadi bersamaan. */
export function staleData(ctx: Ctx): Finding[] {
  const cadence = ctx.facts.rule.expected_cadence_hours;
  const report = ctx.hoursSinceReport;
  const evidenceGap = ctx.hoursSinceEvidence;
  const out: Finding[] = [];

  if (report !== null && report > cadence) {
    const ratio = report / cadence;
    out.push(
      build(ctx, {
        detector: 'stale_report',
        severity: ratio > 2 ? 'attention' : 'watch',
        confidence: 'high',
        method: `hours_since_report = ${fmt(report)} vs cadence ${cadence} jam`,
        reason: `Tidak ada laporan manusia selama ${fmt(report / 24)} hari, padahal proyek ini biasanya diperbarui tiap ${cadence / 24} hari.`,
        unknowns: ['apakah pekerjaan berhenti atau hanya pelaporannya yang berhenti'],
        evidence: [ctx.ev(ctx.latest('reported_actual'), 'laporan terakhir yang tersimpan')],
        action: 'Minta PIC mengirim posisi terbaru; status terakhir sudah tidak bisa dipakai sebagai dasar keputusan.',
      }),
    );
  }

  if (evidenceGap !== null && evidenceGap > cadence) {
    const ratio = evidenceGap / cadence;
    out.push(
      build(ctx, {
        detector: 'stale_evidence',
        severity: ratio > 2 ? 'attention' : 'watch',
        confidence: 'high',
        method: `hours_since_evidence = ${fmt(evidenceGap)} vs cadence ${cadence} jam`,
        reason: `Sistem operasional tidak mengirim data selama ${fmt(evidenceGap / 24)} hari, jadi klaim terakhir tidak punya pembanding.`,
        unknowns: ['apakah koneksi data putus atau memang tidak ada aktivitas'],
        evidence: [ctx.ev(ctx.lastOperational, 'data operasional terakhir yang masuk')],
        action: 'Cek saluran data operasional sebelum mempercayai angka terakhir.',
      }),
    );
  }

  return out;
}

/* ---------------------------------------------------------------- D4 */
/** Pekerjaan tertahan oleh pihak luar. `null` di sini bukan data hilang,
 *  melainkan bukti bahwa koneksi belum pernah berhasil. */
export function blockedDependency(ctx: Ctx): Finding[] {
  const developed = ctx.num('developed_endpoints');
  const tested = ctx.num('production_tested_endpoints');
  const connection = ctx.text('connection_status');
  const lastSuccess = ctx.latest('last_successful_connection');
  const neverConnected = lastSuccess?.presence === 'KNOWN_ABSENT';
  const notConfigured = (connection ?? '').toUpperCase() === 'NOT_CONFIGURED';
  if (!notConfigured && !(developed !== null && developed > 0 && tested === 0)) return [];

  const out: Finding[] = [
    build(ctx, {
      detector: 'blocked_dependency',
      severity: 'critical',
      confidence: 'high',
      method: `developed=${fmt(developed)} tested=${fmt(tested)} connection=${connection ?? 'tidak ada'}`,
      reason: neverConnected
        ? `${fmt(developed)} endpoint selesai dibangun tapi belum pernah sekali pun terhubung ke production. Sistem mencatat "belum pernah berhasil", bukan "belum ada data".`
        : `${fmt(developed)} endpoint selesai dibangun, ${fmt(tested)} yang diuji di production.`,
      unknowns: ['kapan credential akan tersedia'],
      evidence: [
        ctx.ev(ctx.latest('connection_status'), 'status koneksi'),
        ctx.ev(lastSuccess, 'percobaan koneksi terakhir'),
        ctx.ev(ctx.latest('production_tested_endpoints'), 'endpoint yang lolos uji production'),
      ],
      action: 'Kejar customer untuk credential dan endpoint production; tanpa itu tidak ada pekerjaan teknis yang bisa menggeser angka.',
      owner: 'CUSTOMER',
      owner_reason: 'penyediaan akses berada di pihak customer, bukan tim proyek',
    }),
  ];
  return out;
}

/* ---------------------------------------------------------------- D5 */
/** Laju dibandingkan dengan laju yang dibutuhkan sampai deadline.
 *  Dihitung dua basis bila keduanya ada; kalau kesimpulannya berbeda,
 *  temuan ditandai borderline alih-alih memilih salah satu. */
export function scheduleRisk(ctx: Ctx): Finding[] {
  const rule = ctx.facts.rule;
  if (rule.rate_model !== 'flow') return [];
  if (ctx.lifecycle === 'COMPLETED' || ctx.lifecycle === 'CLOSED') return [];
  const target = ctx.facts.project.target;
  const elapsed = ctx.elapsedDays;
  const remaining = ctx.remainingDays;
  if (target === null || elapsed === null || remaining === null || remaining <= 0) return [];

  const candidates: Array<{ name: string; value: number | null; ref: Evidence }> = [
    { name: 'laporan', value: ctx.reported, ref: ctx.ev(ctx.latest('reported_actual'), 'basis laporan') },
    { name: 'tervalidasi', value: ctx.validated, ref: ctx.ev(ctx.latest(ctx.validatedMetricName()), 'basis tervalidasi') },
  ];
  const bases = candidates.flatMap((b) => (b.value !== null && b.value > 0 ? [{ name: b.name, value: b.value, ref: b.ref }] : []));

  if (bases.length === 0) return [];

  const per = bases.map((b) => {
    const achieved = b.value / elapsed;
    const required = (target - b.value) / remaining;
    return { ...b, achieved, required, ratio: achieved > 0 ? required / achieved : Infinity };
  });

  const worst = per.reduce((a, b) => (b.ratio > a.ratio ? b : a));
  const best = per.reduce((a, b) => (b.ratio < a.ratio ? b : a));
  const disagree = per.length > 1 && verdict(best.ratio) !== verdict(worst.ratio);
  // Dua basis yang sah tapi berbeda kesimpulan tidak boleh memimpin daftar sebagai kritis.
  const severity: Severity = disagree ? (severityFor(worst.ratio) === 'critical' ? 'attention' : severityFor(worst.ratio)) : severityFor(worst.ratio);
  if (severity === 'info') return [];

  const detail = per
    .map((p) => `${p.name}: ${fmt(p.achieved)}/hari tercapai vs ${fmt(p.required)}/hari dibutuhkan (${fmt(p.ratio)}x)`)
    .join('; ');

  return [
    build(ctx, {
      detector: 'schedule_risk',
      severity,
      confidence: disagree ? 'medium' : per.length > 1 ? 'high' : 'medium',
      method: `ratio = required_pace / achieved_pace; elapsed ${fmt(elapsed)} hari, sisa ${fmt(remaining)} hari`,
      reason: disagree
        ? `Kesimpulan berbeda tergantung basis. ${detail}. Yang dipakai laporan bilang masih cukup, yang tervalidasi bilang tidak.`
        : `Untuk selesai tepat waktu dibutuhkan ${fmt(worst.required)} ${noun(ctx.facts.project.target_unit)} per hari, sedangkan laju sekarang ${fmt(worst.achieved)}.`,
      unknowns: disagree ? ['angka mana yang dipakai untuk keputusan: laporan atau tervalidasi'] : [],
      evidence: per.map((p) => p.ref),
      action:
        severity === 'critical' && !disagree
          ? 'Angka ini tidak bisa ditutup dengan kerja lebih cepat saja; perlu keputusan lingkup, tambahan kapasitas, atau revisi tanggal.'
          : disagree
            ? 'Putuskan basis mana yang resmi dipakai untuk jadwal. Selama keduanya beredar, keputusan soal tanggal tidak punya dasar tunggal.'
            : 'Putuskan dalam satu hari kerja apakah tanggal atau lingkup yang digeser.',
      borderline: disagree,
    }),
  ];
}

function verdict(ratio: number): Severity {
  if (ratio > 1.25) return 'critical';
  if (ratio > 1.05) return 'attention';
  if (ratio >= 0.9) return 'watch';
  return 'info';
}

function severityFor(ratio: number): Severity {
  return verdict(ratio);
}

/* ---------------------------------------------------------------- D6 */
/** Pekerjaan yang dikerjakan tapi tidak bisa masuk hitungan target. */
export function qualityGap(ctx: Ctx): Finding[] {
  const skipped = ctx.num('records_skipped_missing_region');
  if (skipped === null || skipped <= 0) return [];
  const target = ctx.facts.project.target;
  const share = target ? skipped / target : 0;

  return [
    build(ctx, {
      detector: 'quality_gap',
      severity: share > 0.05 ? 'attention' : 'watch',
      confidence: 'high',
      method: `records_skipped = ${fmt(skipped)} dari target ${fmt(target)}`,
      reason: `${fmt(skipped)} record dilewati karena atribut wajib tidak ada di data sumber. Kalau terus bertambah, target tidak akan tercapai meski kapasitas cukup.`,
      unknowns: ['apakah record ini akan dilengkapi atau dikecualikan dari target'],
      evidence: [ctx.ev(ctx.latest('records_skipped_missing_region'), 'record yang tidak bisa diproses')],
      action: 'Sepakati sekarang: dikembalikan ke sumber untuk dilengkapi, atau dikeluarkan dari penyebut target.',
    }),
  ];
}

/* ---------------------------------------------------------------- D7 */
/** Kapasitas turun karena unit tidak normal. Yang dilaporkan adalah keadaan
 *  unit dan arah perubahannya, bukan terkaan berapa kapasitas yang hilang. */
interface Scanner {
  scanner_id?: string;
  status?: string;
}

export function capacityDegradation(ctx: Ctx): Finding[] {
  const snaps = ctx.all('scanners');
  if (snaps.length === 0) return [];
  const parse = (s: { value_text: string | null }): Scanner[] => {
    try {
      const v = JSON.parse(s.value_text ?? '[]') as unknown;
      return Array.isArray(v) ? (v as Scanner[]) : [];
    } catch {
      return [];
    }
  };
  const now = parse(snaps.at(-1)!);
  if (now.length === 0) return [];
  const down = now.filter((s) => (s.status ?? '').toUpperCase() !== 'RUNNING');
  if (down.length === 0) return [];

  const prev = snaps.length > 1 ? parse(snaps.at(-2)!) : [];
  const prevDown = prev.filter((s) => (s.status ?? '').toUpperCase() !== 'RUNNING').length;

  // Perbaikan bisa terjadi tanpa mengubah jumlah unit yang terganggu,
  // misalnya OUT_OF_SERVICE menjadi LIMITED. Yang dibandingkan keadaannya, bukan hitungannya.
  const score = (status?: string): number => {
    const s = (status ?? '').toUpperCase();
    if (s === 'RUNNING') return 0;
    if (s === 'LIMITED') return 1;
    return 2;
  };
  const nowScore = Math.max(...now.map((s) => score(s.status)));
  const prevScore = prev.length > 0 ? Math.max(...prev.map((s) => score(s.status))) : 0;
  const improving = prev.length > 0 && nowScore < prevScore;
  const allDown = down.length === now.length;

  return [
    build(ctx, {
      detector: 'capacity_degradation',
      severity: allDown ? 'critical' : improving ? 'watch' : 'attention',
      confidence: 'high',
      method: `${down.length}/${now.length} unit tidak RUNNING; snapshot sebelumnya ${prevDown} unit terdampak`,
      reason: `${down.length} dari ${now.length} unit ${improving ? 'masih terbatas dan sudah membaik dari 08:15' : 'tidak berjalan normal'}. Kapasitas tidak boleh diskalakan dari keadaan ini, cukup dicatat.`,
      unknowns: ['berapa throughput nyata sampai unit normal kembali'],
      evidence: [
        ctx.ev(snaps.at(-1), 'keadaan unit terakhir'),
        ...(snaps.length > 1 ? [ctx.ev(snaps.at(-2), 'keadaan unit sebelumnya')] : []),
      ],
      action: improving
        ? 'Pantau sampai unit kembali RUNNING; jangan menaikkan target harian sebelum itu.'
        : 'Ikuti jadwal vendor; jangan menaikkan target harian sampai unit normal.',
      owner: improving ? PM : 'VENDOR',
      owner_reason: improving ? 'perbaikan sudah berjalan, sisa pekerjaannya pengawasan' : 'kerusakan unit berada di kendali vendor',
    }),
  ];
}

/* ---------------------------------------------------------------- D8 */
/** Klaim selesai harus dicek dengan bukti sesudah tanggal selesai. */
export function closureEvidence(ctx: Ctx): Finding[] {
  if (ctx.lifecycle !== 'COMPLETED') return [];
  const deadline = ctx.facts.project.deadline;
  const deadlineMs = deadline ? Date.parse(`${deadline}T23:59:59Z`) : null;
  const deployed = ctx
    .all('deployment_status')
    .filter((v) => (v.value_text ?? '').toUpperCase() === 'COMPLETED')
    .at(-1);
  const alive = ctx.all('application_status').filter((v) => v.provenance === 'OPERATIONAL').at(-1);

  if (!alive) {
    return [
      build(ctx, {
        detector: 'closure_evidence_missing',
        severity: 'attention',
        confidence: 'medium',
        method: 'status COMPLETED tanpa data operasional sesudah selesai',
        reason: 'Proyek ditandai selesai tetapi tidak ada bukti dari sistem yang berjalan.',
        unknowns: ['apakah sistem benar-benar dipakai atau hanya dipasang'],
        evidence: [ctx.ev(ctx.latest('reported_actual'), 'klaim selesai dari laporan')],
        action: 'Minta bukti pemakaian, bukan hanya pernyataan selesai.',
      }),
    ];
  }

  // Yang menentukan tepat waktu adalah saat pekerjaan dinyatakan selesai,
  // bukan saat pemeriksaan kesehatan terakhir dilakukan.
  const finishedMs = deployed?.observed_at ? Date.parse(`${deployed.observed_at}Z`) : null;
  const late = deadlineMs !== null && finishedMs !== null && finishedMs > deadlineMs;

  return [
    build(ctx, {
      detector: 'verified_closure',
      severity: 'info',
      confidence: 'high',
      method: `deployment COMPLETED ${deployed?.observed_at ?? '?'} vs deadline ${deadline ?? '?'}`,
      reason: late
        ? 'Sudah selesai dan terbukti berjalan, tetapi penutupannya jatuh setelah tanggal yang dijanjikan.'
        : 'Selesai tepat waktu dan terbukti masih dipakai sesudahnya. Ini satu-satunya klaim selesai di portofolio yang punya bukti langsung, jadi dipakai sebagai pembanding untuk proyek lain.',
      unknowns: [],
      evidence: [
        ctx.ev(deployed, 'deployment selesai'),
        ctx.ev(alive, 'status aplikasi dari sistem'),
        ctx.ev(ctx.latest('successful_logins_last_24h'), 'pemakaian nyata'),
      ],
      action: 'Tidak ada.',
    }),
  ];
}

/* ---------------------------------------------------------------- D9 */
/** Dua angka di baris yang sama saling bertentangan. */
export function internalInconsistency(ctx: Ctx): Finding[] {
  const actual = ctx.reported;
  const pct = ctx.masterNum('reported_progress_pct') ?? ctx.facts.project.reported_progress_pct;
  const target = ctx.facts.project.target;
  if (actual === null || pct === null || !target) return [];
  const calc = (actual / target) * 100;
  const diff = pct - calc;
  if (Math.abs(diff) <= 1) return [];

  return [
    build(ctx, {
      detector: 'internal_inconsistency',
      severity: Math.abs(diff) > 5 ? 'attention' : 'watch',
      confidence: 'high',
      method: `${fmt(actual)} / ${fmt(target)} = ${fmt(calc)}%, dilaporkan ${fmt(pct)}%`,
      reason: `Persentase yang dilaporkan ${fmt(pct)}% tidak cocok dengan angkanya sendiri. Hitungan dari kuantitas memberi ${fmt(calc)}%, selisih ${fmt(Math.abs(diff))} poin.`,
      unknowns: ['apakah penyebutnya berbeda dari target yang tertulis'],
      evidence: [
        ctx.ev(ctx.latest('reported_actual'), 'kuantitas'),
        ctx.ev(ctx.latest('reported_progress_pct'), 'persentase'),
        ctx.ev(ctx.latest('target'), 'target'),
      ],
      action: 'Perbaiki satu dari dua angka itu; jangan biarkan keduanya beredar.',
    }),
  ];
}

/* ---------------------------------------------------------------- D10 */
/** Status tidak sejalan dengan angka atau dengan buktinya. */
export function statusContradiction(ctx: Ctx): Finding[] {
  const pct = ctx.masterNum('reported_progress_pct') ?? ctx.facts.project.reported_progress_pct;
  const validated = ctx.validated;
  const target = ctx.facts.project.target;

  if (pct !== null && pct >= 100 && ctx.lifecycle !== 'COMPLETED') {
    return [
      build(ctx, {
        detector: 'status_contradiction',
        severity: 'attention',
        confidence: 'high',
        method: `progress ${fmt(pct)}% dengan status ${ctx.lifecycle}`,
        reason: `Progress sudah ${fmt(pct)}% tetapi status masih ${ctx.lifecycle}.`,
        evidence: [ctx.ev(ctx.latest('reported_progress_pct'), 'persentase'), ctx.ev(ctx.latest('reported_status'), 'status')],
        action: 'Selesaikan statusnya atau turunkan angkanya.',
      }),
    ];
  }

  if (ctx.lifecycle === 'COMPLETED' && validated !== null && target !== null && validated < target) {
    return [
      build(ctx, {
        detector: 'status_contradiction',
        severity: 'critical',
        confidence: 'high',
        method: `status COMPLETED dengan ${fmt(validated)}/${fmt(target)} terverifikasi`,
        reason: `Proyek ditutup selesai padahal baru ${fmt(validated)} dari ${fmt(target)} ${noun(ctx.facts.project.target_unit)} yang terverifikasi.`,
        evidence: [ctx.ev(ctx.latest('reported_status'), 'klaim selesai'), ctx.ev(ctx.latest(ctx.validatedMetricName()), 'yang terverifikasi')],
        action: 'Buka kembali proyek atau terbitkan pengecualian tertulis.',
      }),
    ];
  }

  return [];
}

/* ---------------------------------------------------------------- D11 */
/** Tipe proyek ini dihitung dari penerimaan di production, bukan dari
 *  pekerjaan yang sudah dikerjakan. Dua definisi tidak boleh dicampur. */
export function progressBasisConflict(ctx: Ctx): Finding[] {
  if (ctx.facts.rule.progress_basis !== 'accepted_in_production') return [];
  const developed = ctx.num('developed_endpoints');
  const tested = ctx.num('production_tested_endpoints');
  const pct = ctx.masterNum('reported_progress_pct') ?? ctx.facts.project.reported_progress_pct;
  if (developed === null || developed <= 0) return [];

  return [
    build(ctx, {
      detector: 'progress_basis_conflict',
      severity: 'critical',
      confidence: 'high',
      method: `developed=${fmt(developed)} production_tested=${fmt(tested)} basis=${ctx.facts.rule.progress_basis}`,
      reason: `${fmt(pct)}% yang dilaporkan mengukur endpoint yang sudah dibangun, bukan yang diterima di production (${fmt(tested)}). Untuk tipe proyek ini, angka itu belum bisa disebut kemajuan.`,
      unknowns: ['apakah customer menganggap pengembangan selesai sebagai kemajuan'],
      evidence: [
        ctx.ev(ctx.latest('developed_endpoints'), 'sudah dibangun'),
        ctx.ev(ctx.latest('production_tested_endpoints'), 'sudah diterima production'),
        ctx.ev(ctx.latest('reported_progress_pct'), 'angka yang dilaporkan'),
      ],
      action: 'Tampilkan dua angka terpisah: dibangun dan diterima. Jangan memakai satu persentase untuk keduanya.',
    }),
  ];
}

export const DETECTORS = [
  progressGap,
  sourceConflict,
  staleData,
  blockedDependency,
  scheduleRisk,
  qualityGap,
  capacityDegradation,
  closureEvidence,
  internalInconsistency,
  statusContradiction,
  progressBasisConflict,
];
