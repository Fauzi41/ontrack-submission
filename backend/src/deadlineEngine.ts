import type {
  DeadlineAnalysis,
  DeadlineCalculationStep,
  ProjectMasterRecord,
  ProjectUpdateRecord,
} from './types.js';

const MS_PER_DAY = 86_400_000;

export function extractDateOnly(iso: string): string {
  return iso.slice(0, 10);
}

export function diffCalendarDays(startIso: string, endIso: string): number {
  const [sy, sm, sd] = extractDateOnly(startIso).split('-').map(Number);
  const [ey, em, ed] = extractDateOnly(endIso).split('-').map(Number);
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  return Math.round((endUtc - startUtc) / MS_PER_DAY);
}

export function addCalendarDays(baseIso: string, days: number): string {
  const [y, m, d] = extractDateOnly(baseIso).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffHours(earlierIso: string, laterIso: string): number {
  const t1 = Date.parse(earlierIso);
  const t2 = Date.parse(laterIso);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Number(((t2 - t1) / 3_600_000).toFixed(2));
}

function round2(val: number): number {
  return Number(val.toFixed(2));
}

/**
 * Extracts an explicit daily capacity baseline if mentioned in updates
 * (e.g., "kapasitas tim sekitar 4.500 halaman per hari" or "capacity ~4,500 pages/day").
 * Generic regex — never hardcoded per project_id.
 */
export function extractStatedDailyCapacity(
  updates: ProjectUpdateRecord[]
): { capacity: number; refId: string } | null {
  const sorted = [...updates].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  const pattern =
    /(?:kapasitas|capacity)[^0-9]{0,35}(\d{1,3}(?:[.,]\d{3})+|\d+(?:[.,]\d+)?)\s*(?:halaman|pages|box|boxes|ml|records|endpoint|endpoints)?\s*(?:per\s*hari|\/hari|per\s*day|\/day)/i;

  for (const upd of sorted) {
    const match = upd.message.match(pattern);
    if (match && match[1]) {
      // Handle Indonesian thousand separator "4.500" vs decimal
      const rawNum = match[1];
      const normalized = /^\d{1,3}(\.\d{3})+$/.test(rawNum)
        ? rawNum.replace(/\./g, '')
        : rawNum.replace(/,/g, '');
      const parsed = Number(normalized);
      if (Number.isFinite(parsed) && parsed > 0) {
        return { capacity: parsed, refId: upd.update_id };
      }
    }
  }
  return null;
}

export interface DeadlineInput {
  master: ProjectMasterRecord;
  asOfDate: string;
  operationalVerifiedActual: number | null;
  operationalPendingActual: number | null;
  operationalSnapshotDate: string | null;
  updates: ProjectUpdateRecord[];
  isStaleActive?: boolean;
}

export function computeDeadlineAnalysis(input: DeadlineInput): DeadlineAnalysis {
  const {
    master,
    asOfDate,
    operationalVerifiedActual,
    operationalPendingActual,
    operationalSnapshotDate,
    updates,
    isStaleActive = false,
  } = input;

  const isCompleted = master.reported_status.toUpperCase() === 'COMPLETED';
  const totalDurationDays = Math.max(1, diffCalendarDays(master.start_date, master.deadline));
  const rawElapsed = diffCalendarDays(master.start_date, asOfDate);
  const elapsedDays = Math.max(1, Math.min(totalDurationDays, rawElapsed));
  const remainingDays = diffCalendarDays(asOfDate, master.deadline);
  const timeElapsedPct = round2(Math.min(100, Math.max(0, (rawElapsed / totalDurationDays) * 100)));

  const computedReportedPct = round2((master.reported_actual / master.target) * 100);
  const operationalVerifiedPct =
    operationalVerifiedActual !== null
      ? round2((operationalVerifiedActual / master.target) * 100)
      : null;

  const remainingReported = round2(Math.max(0, master.target - master.reported_actual));
  const remainingOperational =
    operationalVerifiedActual !== null
      ? round2(Math.max(0, master.target - operationalVerifiedActual))
      : null;

  // Use observation window if operational snapshot is significantly older than as_of_date
  const opElapsedRaw =
    operationalSnapshotDate !== null
      ? Math.max(1, diffCalendarDays(master.start_date, operationalSnapshotDate))
      : elapsedDays;
  const effectiveElapsedForOp =
    isStaleActive && opElapsedRaw < elapsedDays ? opElapsedRaw : elapsedDays;

  const historicalRateReported =
    rawElapsed > 0 ? round2(master.reported_actual / rawElapsed) : null;
  const historicalRateOperational =
    operationalVerifiedActual !== null && effectiveElapsedForOp > 0
      ? round2(operationalVerifiedActual / effectiveElapsedForOp)
      : null;

  const requiredRateReported =
    !isCompleted && remainingDays > 0 ? round2(remainingReported / remainingDays) : null;
  const requiredRateOperational =
    !isCompleted && remainingDays > 0 && remainingOperational !== null
      ? round2(remainingOperational / remainingDays)
      : null;

  const accelReported =
    requiredRateReported !== null && historicalRateReported && historicalRateReported > 0
      ? round2(requiredRateReported / historicalRateReported)
      : null;
  const accelOperational =
    requiredRateOperational !== null &&
    historicalRateOperational !== null &&
    historicalRateOperational > 0
      ? round2(requiredRateOperational / historicalRateOperational)
      : null;

  const projDaysReported =
    !isCompleted && historicalRateReported && historicalRateReported > 0
      ? round2(remainingReported / historicalRateReported)
      : null;
  const projCompletionReported =
    projDaysReported !== null ? addCalendarDays(asOfDate, Math.ceil(projDaysReported)) : null;
  const projSlipReported =
    projCompletionReported !== null
      ? diffCalendarDays(master.deadline, projCompletionReported)
      : null;

  const projDaysOperational =
    !isCompleted &&
    remainingOperational !== null &&
    historicalRateOperational !== null &&
    historicalRateOperational > 0
      ? round2(remainingOperational / historicalRateOperational)
      : null;
  const projCompletionOperational =
    projDaysOperational !== null
      ? addCalendarDays(asOfDate, Math.ceil(projDaysOperational))
      : null;
  const projSlipOperational =
    projCompletionOperational !== null
      ? diffCalendarDays(master.deadline, projCompletionOperational)
      : null;

  const statedCap = extractStatedDailyCapacity(updates);
  let projDaysCap: number | null = null;
  let projCompCap: string | null = null;
  let projSlipCap: number | null = null;

  if (statedCap && !isCompleted) {
    const baseRemaining = remainingOperational ?? remainingReported;
    projDaysCap = round2(baseRemaining / statedCap.capacity);
    projCompCap = addCalendarDays(asOfDate, Math.ceil(projDaysCap));
    projSlipCap = diffCalendarDays(master.deadline, projCompCap);
  }

  // Determine transparent feasibility verdict
  let verdict: DeadlineAnalysis['feasibility_verdict'] = 'FEASIBLE_IF_CURRENT';
  if (isCompleted) {
    const completedOn = extractDateOnly(master.last_reported_update_at);
    const slip = diffCalendarDays(master.deadline, completedOn);
    verdict = slip <= 0 ? 'COMPLETED_ON_TIME' : 'COMPLETED_LATE';
  } else if (remainingDays < 0) {
    verdict = 'OVERDUE';
  } else if (isStaleActive) {
    verdict = 'INSUFFICIENT_DATA';
  } else if (
    (statedCap && requiredRateOperational !== null && requiredRateOperational > statedCap.capacity * 1.15) ||
    (accelOperational !== null && accelOperational >= 1.75) ||
    (accelReported !== null && accelReported >= 1.75)
  ) {
    verdict = 'MATHEMATICALLY_INFEASIBLE';
  } else if (
    (operationalVerifiedActual === 0 && remainingDays <= 10) ||
    (accelOperational !== null && accelOperational >= 1.35) ||
    (projSlipOperational !== null && projSlipOperational >= 7)
  ) {
    verdict = 'AT_HIGH_RISK';
  } else if (
    (accelOperational !== null && accelOperational >= 1.1) ||
    (projSlipOperational !== null && projSlipOperational >= 2)
  ) {
    verdict = 'PRESSURED';
  }

  // Build explicit step-by-step calculation trail for users & defense Q&A
  const steps: DeadlineCalculationStep[] = [
    {
      step: 1,
      label: 'Durasi Total Proyek (Total Duration)',
      formula: 'Deadline - Start Date (selisih hari kalender)',
      substitution: `${master.deadline} - ${master.start_date}`,
      result: `${totalDurationDays} hari kalender`,
    },
    {
      step: 2,
      label: 'Waktu Berjalan & Sisa Waktu (Elapsed & Remaining Days)',
      formula: 'Elapsed = As-Of Date - Start Date | Remaining = Deadline - As-Of Date',
      substitution: `Elapsed: ${extractDateOnly(asOfDate)} - ${master.start_date} = ${rawElapsed} hari (${timeElapsedPct}%) | Remaining: ${master.deadline} - ${extractDateOnly(asOfDate)} = ${remainingDays} hari`,
      result: isCompleted
        ? `Proyek berstatus COMPLETED (selesai pada ${extractDateOnly(master.last_reported_update_at)})`
        : `${rawElapsed} hari berjalan (${timeElapsedPct}%), sisa ${remainingDays} hari`,
      note: 'Menggunakan tanggal acuan (as-of date) yang didokumentasikan agar hasil deterministik.',
    },
    {
      step: 3,
      label: 'Verifikasi Matematika Persentase Laporan (Reported Progress Audit)',
      formula: '(Reported Actual / Target) × 100%',
      substitution: `(${master.reported_actual.toLocaleString('en-US')} / ${master.target.toLocaleString('en-US')}) × 100%`,
      result: `${computedReportedPct}% (tercatat di Master: ${master.reported_progress_pct}%)`,
      note:
        Math.abs(computedReportedPct - master.reported_progress_pct) > 0.5
          ? `Terdapat selisih aritmetika ${round2(master.reported_progress_pct - computedReportedPct)}% antara angka aktual dan persentase yang dilaporkan.`
          : 'Persentase laporan konsisten dengan rasio reported_actual / target.',
    },
  ];

  if (!isCompleted) {
    steps.push({
      step: 4,
      label: 'Laju Historis Harian (Historical Average Run-Rate)',
      formula: 'Actual Volume / Elapsed Days',
      substitution:
        operationalVerifiedActual !== null
          ? `Reported: ${master.reported_actual.toLocaleString('en-US')} / ${rawElapsed} hari | Operational Verified: ${operationalVerifiedActual.toLocaleString('en-US')} / ${effectiveElapsedForOp} hari`
          : `Reported: ${master.reported_actual.toLocaleString('en-US')} / ${rawElapsed} hari`,
      result:
        historicalRateOperational !== null
          ? `Reported: ${historicalRateReported} ${master.target_unit}/hari | Operational: ${historicalRateOperational} ${master.target_unit}/hari`
          : `Reported: ${historicalRateReported} ${master.target_unit}/hari`,
      note:
        isStaleActive && operationalSnapshotDate
          ? `Laju operasional dihitung sampai tanggal snapshot terakhir (${extractDateOnly(operationalSnapshotDate)}, hari ke-${effectiveElapsedForOp}) agar tidak mengasumsikan output 0 selama periode tanpa laporan.`
          : undefined,
    });

    steps.push({
      step: 5,
      label: 'Sisa Target & Laju Wajib Harian (Required Daily Pace)',
      formula: '(Target - Actual) / Remaining Days',
      substitution:
        remainingOperational !== null && remainingDays > 0
          ? `Reported: (${master.target.toLocaleString('en-US')} - ${master.reported_actual.toLocaleString('en-US')}) / ${remainingDays} | Operational: (${master.target.toLocaleString('en-US')} - ${operationalVerifiedActual!.toLocaleString('en-US')}) / ${remainingDays}`
          : `(${master.target.toLocaleString('en-US')} - ${master.reported_actual.toLocaleString('en-US')}) / ${remainingDays}`,
      result:
        requiredRateOperational !== null
          ? `Reported: ${requiredRateReported} ${master.target_unit}/hari | Operational: ${requiredRateOperational} ${master.target_unit}/hari`
          : requiredRateReported !== null
            ? `${requiredRateReported} ${master.target_unit}/hari`
            : 'Deadline sudah terlewati (remaining <= 0)',
    });

    steps.push({
      step: 6,
      label: 'Faktor Akselerasi & Proyeksi Tanggal Selesai (Pace Ratio & Projected Slip)',
      formula:
        'Acceleration = Required Pace / Historical Pace | Projected Finish = As-Of + ceil(Remaining / Historical Pace)',
      substitution:
        accelOperational !== null && projDaysOperational !== null
          ? `Operational Ratio: ${requiredRateOperational} / ${historicalRateOperational} = ${accelOperational}x | Proyeksi: ${extractDateOnly(asOfDate)} + ceil(${projDaysOperational}) hari`
          : operationalVerifiedActual === 0
            ? `Operational verified = 0 ${master.target_unit} sehingga laju terverifikasi 0/hari (tidak bisa diproyeksikan selesai sebelum blocker terbuka).`
            : `Reported Ratio: ${requiredRateReported} / ${historicalRateReported} = ${accelReported}x`,
      result:
        projCompletionOperational !== null && projSlipOperational !== null
          ? `Proyeksi selesai (laju operasional): ${projCompletionOperational} (${projSlipOperational > 0 ? `+${projSlipOperational} hari terlambat` : projSlipOperational === 0 ? 'tepat waktu' : `${Math.abs(projSlipOperational)} hari lebih cepat`})`
          : operationalVerifiedActual === 0
            ? 'Blocked — 0 output terverifikasi di production'
            : projCompletionReported !== null
              ? `Proyeksi selesai (reported): ${projCompletionReported}`
              : 'Tidak dapat diproyeksikan',
    });

    if (statedCap && projDaysCap !== null && projCompCap !== null && projSlipCap !== null) {
      steps.push({
        step: 7,
        label: 'Uji Batas Kapasitas Maksimal (Stated Capacity Ceiling Check)',
        formula: 'Remaining Volume / Stated Max Daily Capacity',
        substitution: `${(remainingOperational ?? remainingReported).toLocaleString('en-US')} / ${statedCap.capacity.toLocaleString('en-US')} ${master.target_unit}/hari (sumber: ${statedCap.refId})`,
        result: `Minimal butuh ${projDaysCap} hari kerja penuh -> selesai paling cepat ${projCompCap} (${projSlipCap > 0 ? `+${projSlipCap} hari melewati deadline` : 'dalam batas deadline'})`,
        note: 'Asumsi kapasitas normal penuh sebelum memperhitungkan degradasi alat atau libur.',
      });
    }
  }

  return {
    as_of_date: asOfDate,
    start_date: master.start_date,
    deadline: master.deadline,
    is_completed: isCompleted,
    total_duration_days: totalDurationDays,
    elapsed_days: rawElapsed,
    remaining_days: remainingDays,
    time_elapsed_pct: timeElapsedPct,
    target: master.target,
    unit: master.target_unit,
    reported_actual: master.reported_actual,
    reported_progress_pct: master.reported_progress_pct,
    computed_reported_pct: computedReportedPct,
    operational_verified_actual: operationalVerifiedActual,
    operational_verified_pct: operationalVerifiedPct,
    operational_pending_actual: operationalPendingActual,
    historical_daily_rate_reported: historicalRateReported,
    historical_daily_rate_operational: historicalRateOperational,
    remaining_volume_reported: remainingReported,
    remaining_volume_operational: remainingOperational,
    required_daily_rate_reported: requiredRateReported,
    required_daily_rate_operational: requiredRateOperational,
    acceleration_factor_reported: accelReported,
    acceleration_factor_operational: accelOperational,
    projected_days_needed_reported: projDaysReported,
    projected_days_needed_operational: projDaysOperational,
    projected_completion_date_reported: projCompletionReported,
    projected_completion_date_operational: projCompletionOperational,
    projected_slip_days_reported: projSlipReported,
    projected_slip_days_operational: projSlipOperational,
    stated_capacity_per_day: statedCap?.capacity ?? null,
    stated_capacity_source_ref: statedCap?.refId ?? null,
    projected_days_at_stated_capacity: projDaysCap,
    projected_completion_at_stated_capacity: projCompCap,
    projected_slip_at_stated_capacity: projSlipCap,
    feasibility_verdict: verdict,
    calculation_steps: steps,
  };
}
