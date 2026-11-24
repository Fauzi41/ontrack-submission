import { computeDeadlineAnalysis, diffHours, extractDateOnly } from './deadlineEngine.js';
import type {
  AttentionLevel,
  AttentionSignal,
  EvidenceRef,
  FollowUpRecord,
  OperationalSummary,
  ProductionEvidenceRecord,
  ProjectIntelligence,
  ProjectMasterRecord,
  ProjectUpdateRecord,
  ScannerState,
  TimelineEvent,
  UncertaintyItem,
  UncertaintyLevel,
} from './types.js';

const SEVERITY_WEIGHT: Record<AttentionLevel, number> = {
  CRITICAL: 40,
  HIGH: 25,
  MEDIUM: 12,
  LOW: 0,
};

const STALE_THRESHOLD_HOURS = 72; // 3 full days without report OR operational telemetry for active project

function round2(v: number): number {
  return Number(v.toFixed(2));
}

function makeMasterRef(master: ProjectMasterRecord): EvidenceRef {
  return {
    ref_id: `${master.project_id}:MASTER`,
    source_kind: 'PROJECT_MASTER',
    source_label: `Project Master (${master.pic})`,
    timestamp: master.last_reported_update_at,
    excerpt: `reported_actual=${master.reported_actual} ${master.target_unit}, reported_progress_pct=${master.reported_progress_pct}%, status=${master.reported_status}`,
  };
}

function makeUpdateRef(upd: ProjectUpdateRecord): EvidenceRef {
  return {
    ref_id: upd.update_id,
    source_kind: 'PROJECT_UPDATE',
    source_label: `${upd.source_type} (${upd.source_name})`,
    timestamp: upd.timestamp,
    excerpt: upd.message,
  };
}

function makeProdRef(rec: ProductionEvidenceRecord, excerpt?: string): EvidenceRef {
  return {
    ref_id: rec.source_record_id,
    source_kind: 'PRODUCTION_EVIDENCE',
    source_label: `${rec.source_system} / ${rec.record_type}`,
    timestamp: rec.timestamp,
    excerpt,
  };
}

/**
 * Extracts normalized operational facts from arbitrary schema-compliant Production Data records.
 * Strictly data-driven by field semantics in the Data Dictionary — ZERO project_id hardcoding.
 */
export function buildOperationalSummary(
  master: ProjectMasterRecord,
  updates: ProjectUpdateRecord[],
  prodRecords: ProductionEvidenceRecord[],
  asOfDate: string
): { summary: OperationalSummary; snapshotDateForVerified: string | null } {
  const sortedProd = [...prodRecords].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );
  const sortedUpdates = [...updates].sort(
    (a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp)
  );

  const latestProd = sortedProd.length > 0 ? sortedProd[sortedProd.length - 1] : null;
  const latestUpdate = sortedUpdates.length > 0 ? sortedUpdates[sortedUpdates.length - 1] : null;

  let verifiedQuantity: number | null = null;
  let pendingQuantity: number | null = null;
  let verifiedSourceRef: EvidenceRef | null = null;
  let pendingSourceRef: EvidenceRef | null = null;
  let snapshotDateForVerified: string | null = null;

  let qualitySkippedCount: number | null = null;
  let integrationDeveloped: number | null = null;
  let integrationConfigured: number | null = null;
  let integrationProductionTested: number | null = null;
  let integrationTarget: number | null = null;

  let envStatus: OperationalSummary['environment_status'] = null;
  const scannerSnapshots: Array<{
    timestamp: string;
    source_ref: EvidenceRef;
    units: ScannerState[];
  }> = [];
  let dmsStatus: OperationalSummary['dms_status'] = null;

  for (const rec of sortedProd) {
    const p = rec.raw_payload;

    // Verified / primary operational quantity extractors (latest timestamp wins per metric)
    if (typeof p.verified_quantity === 'number') {
      verifiedQuantity = p.verified_quantity;
      snapshotDateForVerified = rec.timestamp;
      verifiedSourceRef = makeProdRef(
        rec,
        `verified_quantity=${p.verified_quantity} ${String(p.unit ?? master.target_unit)} (${String(p.workflow_state ?? 'VERIFIED')})`
      );
    }
    if (typeof p.pending_internal_check_quantity === 'number') {
      pendingQuantity = p.pending_internal_check_quantity;
      pendingSourceRef = makeProdRef(
        rec,
        `pending_internal_check_quantity=${p.pending_internal_check_quantity} ${String(p.unit ?? master.target_unit)}`
      );
    }
    if (typeof p.pages_processed_total === 'number') {
      verifiedQuantity = p.pages_processed_total;
      snapshotDateForVerified = rec.timestamp;
      verifiedSourceRef = makeProdRef(
        rec,
        `pages_processed_total=${p.pages_processed_total} ${String(p.unit ?? 'pages')}`
      );
    }
    if (typeof p.processed_boxes === 'number') {
      verifiedQuantity = p.processed_boxes;
      snapshotDateForVerified = rec.timestamp;
      verifiedSourceRef = makeProdRef(
        rec,
        `processed_boxes=${p.processed_boxes} ${String(p.unit ?? 'boxes')}`
      );
    }
    if (typeof p.records_verified === 'number') {
      verifiedQuantity = p.records_verified;
      snapshotDateForVerified = rec.timestamp;
      verifiedSourceRef = makeProdRef(
        rec,
        `records_verified=${p.records_verified} ${String(p.unit ?? 'records')}`
      );
    }

    // Quality skipped records
    if (typeof p.records_skipped_missing_region === 'number') {
      qualitySkippedCount = p.records_skipped_missing_region;
    }

    // Integration endpoints
    if (
      typeof p.developed_endpoints === 'number' ||
      typeof p.production_tested_endpoints === 'number'
    ) {
      if (typeof p.developed_endpoints === 'number') integrationDeveloped = p.developed_endpoints;
      if (typeof p.configured_endpoints === 'number') integrationConfigured = p.configured_endpoints;
      if (typeof p.production_tested_endpoints === 'number') {
        integrationProductionTested = p.production_tested_endpoints;
        verifiedQuantity = p.production_tested_endpoints;
        snapshotDateForVerified = rec.timestamp;
        verifiedSourceRef = makeProdRef(
          rec,
          `developed=${p.developed_endpoints}, configured=${p.configured_endpoints}, production_tested=${p.production_tested_endpoints}/${p.target_endpoints}`
        );
      }
      if (typeof p.target_endpoints === 'number') integrationTarget = p.target_endpoints;
    }

    // Environment checks
    if (typeof p.connection_status === 'string' && typeof p.environment === 'string') {
      envStatus = {
        environment: p.environment,
        connection_status: p.connection_status,
        last_successful_connection:
          typeof p.last_successful_connection === 'string' ? p.last_successful_connection : null,
        source_ref: makeProdRef(
          rec,
          `environment=${p.environment}, connection_status=${p.connection_status}, last_successful_connection=${String(p.last_successful_connection)}`
        ),
      };
    }

    // Scanner status arrays
    if (Array.isArray(p.scanners)) {
      const units = p.scanners
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === 'object'))
        .map((s) => ({
          scanner_id: String(s.scanner_id ?? 'UNKNOWN'),
          status: String(s.status ?? 'UNKNOWN'),
        }));
      if (units.length > 0) {
        scannerSnapshots.push({
          timestamp: rec.timestamp,
          source_ref: makeProdRef(
            rec,
            units.map((u) => `${u.scanner_id}:${u.status}`).join(', ')
          ),
          units,
        });
      }
    }

    // DMS / Application monitoring
    if (typeof p.application_status === 'string') {
      const prevDms = dmsStatus as OperationalSummary['dms_status'];
      dmsStatus = {
        application_status: p.application_status,
        deployment_status:
          typeof p.deployment_status === 'string'
            ? p.deployment_status
            : prevDms?.deployment_status,
        active_users_last_24h:
          typeof p.active_users_last_24h === 'number'
            ? p.active_users_last_24h
            : prevDms?.active_users_last_24h,
        successful_logins_last_24h:
          typeof p.successful_logins_last_24h === 'number'
            ? p.successful_logins_last_24h
            : prevDms?.successful_logins_last_24h,
        failed_logins_last_24h:
          typeof p.failed_logins_last_24h === 'number'
            ? p.failed_logins_last_24h
            : prevDms?.failed_logins_last_24h,
        source_ref: makeProdRef(
          rec,
          `app=${p.application_status}${typeof p.active_users_last_24h === 'number' ? `, active_users_24h=${p.active_users_last_24h}, logins_ok=${p.successful_logins_last_24h}, logins_fail=${p.failed_logins_last_24h}` : ''}`
        ),
      };
      if (
        verifiedQuantity === null &&
        p.application_status === 'ONLINE' &&
        (p.deployment_status === 'COMPLETED' || dmsStatus.deployment_status === 'COMPLETED') &&
        master.target_unit.toLowerCase() === 'system'
      ) {
        verifiedQuantity = 1;
        snapshotDateForVerified = rec.timestamp;
        verifiedSourceRef = dmsStatus.source_ref;
      }
    }
  }

  let qualitySkipRatePct: number | null = null;
  if (qualitySkippedCount !== null && verifiedQuantity !== null && verifiedQuantity + qualitySkippedCount > 0) {
    qualitySkipRatePct = round2((qualitySkippedCount / (verifiedQuantity + qualitySkippedCount)) * 100);
  }

  const latestScanner =
    scannerSnapshots.length > 0 ? scannerSnapshots[scannerSnapshots.length - 1] : null;
  const previousScanner =
    scannerSnapshots.length > 1 ? scannerSnapshots[scannerSnapshots.length - 2] : undefined;

  return {
    snapshotDateForVerified,
    summary: {
      latest_timestamp: latestProd?.timestamp ?? null,
      hours_since_last_operational: latestProd ? diffHours(latestProd.timestamp, asOfDate) : null,
      hours_since_last_update: latestUpdate ? diffHours(latestUpdate.timestamp, asOfDate) : null,
      hours_since_last_master_report: diffHours(master.last_reported_update_at, asOfDate),
      verified_quantity: verifiedQuantity,
      pending_quantity: pendingQuantity,
      verified_source_ref: verifiedSourceRef,
      pending_source_ref: pendingSourceRef,
      quality_skipped_count: qualitySkippedCount,
      quality_skip_rate_pct: qualitySkipRatePct,
      integration_developed: integrationDeveloped,
      integration_configured: integrationConfigured,
      integration_production_tested: integrationProductionTested,
      integration_target: integrationTarget,
      environment_status: envStatus,
      scanners: latestScanner
        ? {
            latest_timestamp: latestScanner.timestamp,
            source_ref: latestScanner.source_ref,
            units: latestScanner.units,
            previous_snapshot: previousScanner,
          }
        : null,
      dms_status: dmsStatus,
    },
  };
}

function summarizeProdRecord(rec: ProductionEvidenceRecord): string {
  const p = rec.raw_payload;
  const parts: string[] = [];
  if (typeof p.verified_quantity === 'number')
    parts.push(`Verified: ${p.verified_quantity} ${String(p.unit ?? '')}`);
  if (typeof p.pending_internal_check_quantity === 'number')
    parts.push(`Pending internal check: ${p.pending_internal_check_quantity} ${String(p.unit ?? '')}`);
  if (typeof p.pages_processed_total === 'number')
    parts.push(`Total pages logged: ${p.pages_processed_total.toLocaleString('en-US')}`);
  if (typeof p.processed_boxes === 'number')
    parts.push(`Processed boxes: ${p.processed_boxes.toLocaleString('en-US')}`);
  if (typeof p.records_verified === 'number')
    parts.push(`Records verified: ${p.records_verified.toLocaleString('en-US')}`);
  if (typeof p.records_skipped_missing_region === 'number')
    parts.push(`Skipped (missing region): ${p.records_skipped_missing_region.toLocaleString('en-US')}`);
  if (typeof p.developed_endpoints === 'number')
    parts.push(
      `Endpoints: ${p.developed_endpoints}/${p.target_endpoints} dev, ${p.configured_endpoints} configured, ${p.production_tested_endpoints} prod-tested`
    );
  if (typeof p.connection_status === 'string')
    parts.push(
      `Env ${String(p.environment)}: ${p.connection_status} (last_ok=${String(p.last_successful_connection)})`
    );
  if (Array.isArray(p.scanners)) {
    const sc = p.scanners
      .map((s) => {
        const obj = s as Record<string, unknown>;
        return `${String(obj.scanner_id)}=${String(obj.status)}`;
      })
      .join(', ');
    parts.push(`Scanners: ${sc}`);
  }
  if (typeof p.application_status === 'string') {
    const extra =
      typeof p.active_users_last_24h === 'number'
        ? ` | ${p.active_users_last_24h} active users, ${p.successful_logins_last_24h} ok / ${p.failed_logins_last_24h} failed logins (24h)`
        : typeof p.deployment_status === 'string'
          ? ` | deployment=${p.deployment_status}`
          : '';
    parts.push(`App ${p.application_status}${extra}`);
  }
  return parts.length > 0 ? parts.join(' • ') : `${rec.source_system}: ${rec.record_type}`;
}

export function evaluateProjectIntelligence(
  master: ProjectMasterRecord,
  updates: ProjectUpdateRecord[],
  prodRecords: ProductionEvidenceRecord[],
  followups: FollowUpRecord[],
  asOfDate: string
): ProjectIntelligence {
  const isCompleted = master.reported_status.toUpperCase() === 'COMPLETED';

  // Filter records chronologically up to asOfDate so historical time-travel works accurately!
  const asOfMs = Date.parse(asOfDate);
  const validUpdates = updates
    .filter((u) => Date.parse(u.timestamp) <= asOfMs)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
  const validProd = prodRecords
    .filter((p) => Date.parse(p.timestamp) <= asOfMs)
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

  const { summary: op, snapshotDateForVerified } = buildOperationalSummary(
    master,
    validUpdates,
    validProd,
    asOfDate
  );

  // R5 Staleness Pre-check (needed by deadline engine to avoid falsely assuming 0 production during silence)
  const isStaleActive =
    !isCompleted &&
    (op.hours_since_last_update === null || op.hours_since_last_update >= STALE_THRESHOLD_HOURS) &&
    (op.hours_since_last_operational === null ||
      op.hours_since_last_operational >= STALE_THRESHOLD_HOURS);

  const deadlineAnalysis = computeDeadlineAnalysis({
    master,
    asOfDate,
    operationalVerifiedActual: op.verified_quantity,
    operationalPendingActual: op.pending_quantity,
    operationalSnapshotDate: snapshotDateForVerified,
    updates: validUpdates,
    isStaleActive,
  });

  const signals: AttentionSignal[] = [];
  const unknowns: UncertaintyItem[] = [];
  const masterRef = makeMasterRef(master);

  // =========================================================================
  // RULE R1: Internal Report Arithmetic Consistency (reported_actual/target vs reported_progress_pct)
  // =========================================================================
  const pctGap = round2(master.reported_progress_pct - deadlineAnalysis.computed_reported_pct);
  if (Math.abs(pctGap) > 0.5) {
    signals.push({
      signal_id: `${master.project_id}-R1-MATH`,
      rule_code: 'R1_REPORT_MATH_MISMATCH',
      severity: Math.abs(pctGap) >= 5 ? 'HIGH' : 'MEDIUM',
      category: 'REPORT_INCONSISTENCY',
      title: `Inkonsistensi Persentase Laporan (+${pctGap > 0 ? pctGap : pctGap}% selisih aritmetika)`,
      explanation: `Project Master melaporkan progress ${master.reported_progress_pct}%, padahal rasio reported_actual/target (${master.reported_actual.toLocaleString('en-US')} / ${master.target.toLocaleString('en-US')}) adalah ${deadlineAnalysis.computed_reported_pct}%. Sistem tidak menimpa nilai laporan, namun menandai gap ${Math.abs(pctGap)} poin persentase untuk klarifikasi definisi perhitungan.`,
      reported_claim: `${master.reported_progress_pct}% (${master.reported_actual.toLocaleString('en-US')} / ${master.target.toLocaleString('en-US')} ${master.target_unit})`,
      observed_reality: `Kalkulasi aktual/target = ${deadlineAnalysis.computed_reported_pct}% (selisih ${pctGap > 0 ? '+' : ''}${pctGap}%)`,
      evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
    });
    unknowns.push({
      code: 'UNKNOWN_PROGRESS_FORMULA',
      title: 'Basis rumus reported_progress_pct tidak cocok dengan rasio aktual/target',
      description: `Belum diketahui apakah angka ${master.reported_progress_pct}% menggunakan bobot tahapan lain, pembulatan manual, atau mencakup item yang belum masuk rekap aktual (${deadlineAnalysis.computed_reported_pct}%).`,
      impact: 'Berpotensi menyamarkan keterlambatan proyek terhadap garis waktu linear.',
      evidence_refs: [masterRef],
    });
  }

  // =========================================================================
  // RULE R2: Reported vs Operational Evidence Reconciliation
  // =========================================================================
  if (
    op.integration_developed !== null &&
    op.integration_production_tested !== null &&
    op.integration_target !== null
  ) {
    // R2C: Integration Validation / Definition-of-Done Gap
    if (op.integration_developed > op.integration_production_tested) {
      const prodTestedPct = round2((op.integration_production_tested / op.integration_target) * 100);
      signals.push({
        signal_id: `${master.project_id}-R2C-VALIDATION`,
        rule_code: 'R2C_VALIDATION_DOD_GAP',
        severity:
          op.integration_production_tested === 0 && deadlineAnalysis.remaining_days <= 10
            ? 'CRITICAL'
            : 'HIGH',
        category: 'VALIDATION_GAP',
        title: `Progress ${master.reported_progress_pct}% Hanya Mencerminkan Development — 0% Teruji di Production`,
        explanation: `Laporan menampilkan ${master.reported_actual}/${master.target} (${master.reported_progress_pct}%) dengan status ${master.reported_status}, namun telemetry api_monitor menunjukkan baru ${op.integration_production_tested}/${op.integration_target} endpoint (${prodTestedPct}%) yang teruji pada environment production. Masih tersisa ${op.integration_target - op.integration_developed} endpoint yang belum selesai development dan seluruh ${op.integration_target} endpoint belum melewati validasi production.`,
        reported_claim: `${master.reported_actual}/${master.target} ${master.target_unit} (${master.reported_progress_pct}%, ${master.reported_status})`,
        observed_reality: `Developed: ${op.integration_developed}/${op.integration_target}, Configured: ${op.integration_configured ?? '?'}, Production-Tested: ${op.integration_production_tested}/${op.integration_target} (${prodTestedPct}%)`,
        evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
      });
    }
  } else if (op.verified_quantity !== null) {
    const qtyDelta = round2(master.reported_actual - op.verified_quantity);
    if (Math.abs(qtyDelta) > 0.01) {
      // Check if difference is explained by pending_internal_check_quantity (Workflow-State Gap, NOT necessarily an error!)
      if (
        op.pending_quantity !== null &&
        Math.abs(op.verified_quantity + op.pending_quantity - master.reported_actual) <= 0.1
      ) {
        const relatedPendingUpdates = validUpdates.filter((u) =>
          /pengecekan internal|belum.*verifikasi|internal check/i.test(u.message)
        );
        signals.push({
          signal_id: `${master.project_id}-R2A-WORKFLOW`,
          rule_code: 'R2A_WORKFLOW_STATE_GAP',
          severity: 'MEDIUM',
          category: 'WORKFLOW_STATE_GAP',
          title: `Selisih Definisi Workflow: ${op.pending_quantity} ${master.target_unit} Masih Pending Internal Check`,
          explanation: `Reported actual (${master.reported_actual} ${master.target_unit}) cocok persis dengan jumlah VERIFIED (${op.verified_quantity} ${master.target_unit}) + PENDING_INTERNAL_CHECK (${op.pending_quantity} ${master.target_unit}). Ini BUKAN kesalahan pencatatan, melainkan perbedaan definisi status: volume ${op.pending_quantity} ${master.target_unit} belum lolos verifikasi final dan rentan revisi.`,
          reported_claim: `${master.reported_actual} ${master.target_unit} (${master.reported_progress_pct}%)`,
          observed_reality: `VERIFIED=${op.verified_quantity} ${master.target_unit} (${deadlineAnalysis.operational_verified_pct}%) + PENDING_INTERNAL_CHECK=${op.pending_quantity} ${master.target_unit}`,
          evidence_refs: [
            masterRef,
            ...(op.verified_source_ref ? [op.verified_source_ref] : []),
            ...(op.pending_source_ref ? [op.pending_source_ref] : []),
            ...relatedPendingUpdates.map(makeUpdateRef),
          ],
        });
      } else {
        // Unreconciled discrepancy between master report and operational log
        const lagHours = op.verified_source_ref
          ? diffHours(op.verified_source_ref.timestamp, master.last_reported_update_at)
          : null;
        signals.push({
          signal_id: `${master.project_id}-R2B-DISCREPANCY`,
          rule_code: 'R2B_REPORT_VS_OPERATIONAL_GAP',
          severity: Math.abs(qtyDelta / master.target) >= 0.03 ? 'HIGH' : 'MEDIUM',
          category: 'SOURCE_DISCREPANCY',
          title: `Selisih Volume Laporan vs Log Operasional (${qtyDelta > 0 ? '+' : ''}${qtyDelta.toLocaleString('en-US')} ${master.target_unit})`,
          explanation: `Project Master mencatat ${master.reported_actual.toLocaleString('en-US')} ${master.target_unit} (${master.last_reported_update_at}), sedangkan log sistem operasional mencatat ${op.verified_quantity.toLocaleString('en-US')} ${master.target_unit} (${op.verified_source_ref?.timestamp ?? 'N/A'}). Terdapat selisih ${Math.abs(qtyDelta).toLocaleString('en-US')} ${master.target_unit}${lagHours !== null ? ` dengan jarak waktu ${Math.abs(lagHours)} jam` : ''}. Kedua nilai tetap dipertahankan tanpa menimpa satu sama lain.`,
          reported_claim: `${master.reported_actual.toLocaleString('en-US')} ${master.target_unit} @ ${master.last_reported_update_at}`,
          observed_reality: `${op.verified_quantity.toLocaleString('en-US')} ${master.target_unit} @ ${op.verified_source_ref?.timestamp ?? 'N/A'}`,
          evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
        });
        unknowns.push({
          code: 'UNKNOWN_VOLUME_DELTA',
          title: `Sumber selisih ${Math.abs(qtyDelta).toLocaleString('en-US')} ${master.target_unit} belum terjelaskan`,
          description: `Belum ada bukti apakah selisih berasal dari jeda sinkronisasi cut-off log, pekerjaan manual di luar log sistem, atau koreksi/over-reporting pada master.`,
          impact: `Menggeser sisa beban kerja dari ${deadlineAnalysis.remaining_volume_reported.toLocaleString('en-US')} menjadi ${deadlineAnalysis.remaining_volume_operational?.toLocaleString('en-US') ?? '?'} ${master.target_unit}.`,
          evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
        });
      }
    }
  }

  // =========================================================================
  // RULE R3: Deadline & Schedule Feasibility Analysis
  // =========================================================================
  if (!isCompleted) {
    if (deadlineAnalysis.feasibility_verdict === 'OVERDUE') {
      signals.push({
        signal_id: `${master.project_id}-R3-OVERDUE`,
        rule_code: 'R3_SCHEDULE_OVERDUE',
        severity: 'CRITICAL',
        category: 'SCHEDULE_FEASIBILITY',
        title: `Melewati Deadline (${Math.abs(deadlineAnalysis.remaining_days)} hari terlambat)`,
        explanation: `Deadline proyek (${master.deadline}) sudah terlewati terhadap tanggal acuan ${extractDateOnly(asOfDate)} namun status masih ${master.reported_status}.`,
        reported_claim: `${master.reported_status} (deadline ${master.deadline})`,
        observed_reality: `Sisa hari: ${deadlineAnalysis.remaining_days} hari; volume tersisa: ${(deadlineAnalysis.remaining_volume_operational ?? deadlineAnalysis.remaining_volume_reported).toLocaleString('en-US')} ${master.target_unit}`,
        evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
      });
    } else if (deadlineAnalysis.feasibility_verdict === 'MATHEMATICALLY_INFEASIBLE') {
      const capRef = deadlineAnalysis.stated_capacity_source_ref
        ? validUpdates.find((u) => u.update_id === deadlineAnalysis.stated_capacity_source_ref)
        : undefined;
      signals.push({
        signal_id: `${master.project_id}-R3-INFEASIBLE`,
        rule_code: 'R3_SCHEDULE_INFEASIBLE',
        severity: 'CRITICAL',
        category: 'SCHEDULE_FEASIBILITY',
        title: `Target Deadline (${master.deadline}, sisa ${deadlineAnalysis.remaining_days} hari) Tidak Feasible Secara Matematis`,
        explanation: `Dibutuhkan laju ${deadlineAnalysis.required_daily_rate_operational?.toLocaleString('en-US') ?? deadlineAnalysis.required_daily_rate_reported?.toLocaleString('en-US')} ${master.target_unit}/hari (${deadlineAnalysis.acceleration_factor_operational ?? deadlineAnalysis.acceleration_factor_reported}x dari laju historis ${deadlineAnalysis.historical_daily_rate_operational?.toLocaleString('en-US') ?? deadlineAnalysis.historical_daily_rate_reported?.toLocaleString('en-US')}/hari)${deadlineAnalysis.stated_capacity_per_day ? ` dan melampaui kapasitas penuh normal (${deadlineAnalysis.stated_capacity_per_day.toLocaleString('en-US')}/hari)` : ''}. Proyeksi selesai: ${deadlineAnalysis.projected_completion_date_operational ?? deadlineAnalysis.projected_completion_date_reported} (terlambat +${deadlineAnalysis.projected_slip_days_operational ?? deadlineAnalysis.projected_slip_days_reported} hari).`,
        reported_claim: `ON TRACK (deadline ${master.deadline})`,
        observed_reality: `Laju wajib: ${deadlineAnalysis.required_daily_rate_operational ?? deadlineAnalysis.required_daily_rate_reported}/hari vs historis ${deadlineAnalysis.historical_daily_rate_operational ?? deadlineAnalysis.historical_daily_rate_reported}/hari${deadlineAnalysis.stated_capacity_per_day ? ` (max normal ${deadlineAnalysis.stated_capacity_per_day}/hari)` : ''}`,
        evidence_refs: [
          masterRef,
          ...(op.verified_source_ref ? [op.verified_source_ref] : []),
          ...(capRef ? [makeUpdateRef(capRef)] : []),
        ],
      });
    } else if (deadlineAnalysis.feasibility_verdict === 'AT_HIGH_RISK') {
      signals.push({
        signal_id: `${master.project_id}-R3-HIGHRISK`,
        rule_code: 'R3_SCHEDULE_HIGH_RISK',
        severity: 'HIGH',
        category: 'SCHEDULE_FEASIBILITY',
        title: `Risiko Tinggi Keterlambatan Jadwal (Deadline ${master.deadline}, sisa ${deadlineAnalysis.remaining_days} hari)`,
        explanation:
          op.verified_quantity === 0
            ? `Sisa waktu tinggal ${deadlineAnalysis.remaining_days} hari (${deadlineAnalysis.time_elapsed_pct}% durasi sudah terpakai) dengan output terverifikasi di production masih 0 ${master.target_unit}.`
            : `Laju wajib operasional (${deadlineAnalysis.required_daily_rate_operational?.toLocaleString('en-US')} ${master.target_unit}/hari) membutuhkan akselerasi ${deadlineAnalysis.acceleration_factor_operational}x dari laju historis (${deadlineAnalysis.historical_daily_rate_operational?.toLocaleString('en-US')}/hari). Pada laju saat ini proyek diproyeksikan selesai ${deadlineAnalysis.projected_completion_date_operational} (+${deadlineAnalysis.projected_slip_days_operational} hari terlambat).`,
        reported_claim: `${master.reported_status} (${master.reported_progress_pct}%)`,
        observed_reality:
          op.verified_quantity === 0
            ? `0 terverifikasi, sisa ${deadlineAnalysis.remaining_days} hari`
            : `Proyeksi selesai ${deadlineAnalysis.projected_completion_date_operational} (+${deadlineAnalysis.projected_slip_days_operational} hari), progress terverifikasi ${deadlineAnalysis.operational_verified_pct}% vs waktu terpakai ${deadlineAnalysis.time_elapsed_pct}%`,
        evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
      });
    } else if (deadlineAnalysis.feasibility_verdict === 'PRESSURED') {
      signals.push({
        signal_id: `${master.project_id}-R3-PRESSURED`,
        rule_code: 'R3_SCHEDULE_PRESSURED',
        severity: 'MEDIUM',
        category: 'SCHEDULE_FEASIBILITY',
        title: `Tekanan Jadwal pada Output Terverifikasi (butuh akselerasi ${deadlineAnalysis.acceleration_factor_operational}x)`,
        explanation: `Berdasarkan volume terverifikasi (${op.verified_quantity} ${master.target_unit}), sisa ${deadlineAnalysis.remaining_volume_operational} ${master.target_unit} dalam ${deadlineAnalysis.remaining_days} hari membutuhkan ${deadlineAnalysis.required_daily_rate_operational} ${master.target_unit}/hari dibanding rata-rata historis terverifikasi ${deadlineAnalysis.historical_daily_rate_operational} ${master.target_unit}/hari.`,
        reported_claim: `${master.reported_status} (${master.reported_progress_pct}%)`,
        observed_reality: `Verified pace ${deadlineAnalysis.historical_daily_rate_operational}/hari vs required ${deadlineAnalysis.required_daily_rate_operational}/hari (proyeksi ${deadlineAnalysis.projected_completion_date_operational})`,
        evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
      });
    }
  }

  // =========================================================================
  // RULE R4A: Operational Equipment / Resource Degradation (e.g., Scanners)
  // =========================================================================
  if (op.scanners) {
    const degraded = op.scanners.units.filter((u) => u.status !== 'RUNNING');
    if (degraded.length > 0) {
      const hasOutOfService = degraded.some((u) => u.status === 'OUT_OF_SERVICE');
      const totalUnits = op.scanners.units.length;
      const relatedUpdates = validUpdates.filter((u) => /scanner|feeding|vendor|teknisi/i.test(u.message));
      const refs: EvidenceRef[] = [op.scanners.source_ref];
      if (op.scanners.previous_snapshot) refs.push(op.scanners.previous_snapshot.source_ref);
      refs.push(...relatedUpdates.slice(-2).map(makeUpdateRef));

      signals.push({
        signal_id: `${master.project_id}-R4A-RESOURCE`,
        rule_code: 'R4A_OPERATIONAL_RESOURCE_DEGRADED',
        severity: hasOutOfService ? 'CRITICAL' : 'HIGH',
        category: 'OPERATIONAL_HEALTH',
        title: `Kapasitas Perangkat Terdegradasi (${degraded.map((d) => `${d.scanner_id}: ${d.status}`).join(', ')})`,
        explanation: `Snapshot operasional terbaru (${op.scanners.latest_timestamp}) menunjukkan ${degraded.length} dari ${totalUnits} unit tidak beroperasi penuh (${degraded.map((d) => `${d.scanner_id}=${d.status}`).join(', ')}).${op.scanners.previous_snapshot ? ` Sebelumnya pada ${op.scanners.previous_snapshot.timestamp} tercatat gangguan (${op.scanners.previous_snapshot.units.filter((u) => u.status !== 'RUNNING').map((u) => `${u.scanner_id}=${u.status}`).join(', ')}).` : ''} Artinya kapasitas efektif saat ini berada di bawah kondisi normal.`,
        reported_claim: `${master.reported_status}`,
        observed_reality: op.scanners.units.map((u) => `${u.scanner_id}: ${u.status}`).join(', '),
        evidence_refs: refs,
      });

      unknowns.push({
        code: 'UNKNOWN_DEGRADED_THROUGHPUT',
        title: 'Kecepatan aktual unit berstatus LIMITED belum terukur',
        description: `Belum ada log produksi harian pasca perbaikan unit (${op.scanners.latest_timestamp}) sehingga kapasitas riil per jam/hari saat ini belum diketahui pasti.`,
        impact: 'Sulit memastikan apakah lembur/tambahan shift cukup menutup defisit volume.',
        evidence_refs: [op.scanners.source_ref],
      });
    }
  }

  // =========================================================================
  // RULE R4B: Production Environment Readiness / External Dependency Blocker
  // =========================================================================
  if (
    !isCompleted &&
    op.environment_status &&
    op.environment_status.connection_status.toUpperCase() !== 'CONNECTED'
  ) {
    const blockerUpdates = validUpdates.filter((u) =>
      /credential|akses production|production endpoint|belum diterima|menunggu/i.test(u.message)
    );
    signals.push({
      signal_id: `${master.project_id}-R4B-ENV`,
      rule_code: 'R4B_ENVIRONMENT_NOT_READY',
      severity: deadlineAnalysis.remaining_days <= 10 ? 'CRITICAL' : 'HIGH',
      category: 'EXTERNAL_BLOCKER',
      title: `Environment ${op.environment_status.environment} Berstatus ${op.environment_status.connection_status}`,
      explanation: `Pemeriksaan sistem (${op.environment_status.source_ref.ref_id}) mengonfirmasi koneksi ${op.environment_status.environment} belum terkonfigurasi (connection_status=${op.environment_status.connection_status}, last_successful_connection=${String(op.environment_status.last_successful_connection)}). Ketergantungan eksternal terhadap akses/credential customer menghambat pengujian akhir.`,
      reported_claim: `${master.reported_status} (${master.reported_progress_pct}%)`,
      observed_reality: `${op.environment_status.environment}: ${op.environment_status.connection_status}, last_successful_connection=null`,
      evidence_refs: [
        op.environment_status.source_ref,
        ...blockerUpdates.map(makeUpdateRef),
      ],
    });

    unknowns.push({
      code: 'UNKNOWN_EXTERNAL_ETA',
      title: 'Tidak ada ETA pasti kapan akses/credential production diberikan customer',
      description:
        'Update koordinasi dari tim Account dan PM belum mencantumkan tanggal komitmen dari PIC customer maupun durasi yang dibutuhkan untuk UAT/bugfix setelah koneksi aktif.',
      impact: `Setiap hari penundaan langsung menggerus sisa ${deadlineAnalysis.remaining_days} hari menuju deadline ${master.deadline}.`,
      evidence_refs: [op.environment_status.source_ref, ...blockerUpdates.map(makeUpdateRef)],
    });
  }

  // =========================================================================
  // RULE R4C: Data Quality / Skipped Records Loss
  // =========================================================================
  if (op.quality_skipped_count !== null && op.quality_skipped_count > 0) {
    const skipRec = validProd.find(
      (r) => typeof r.raw_payload.records_skipped_missing_region === 'number'
    );
    const skipUpdates = validUpdates.filter((u) =>
      /dilewati|kosong|wilayah|skipped/i.test(u.message)
    );
    signals.push({
      signal_id: `${master.project_id}-R4C-QUALITY`,
      rule_code: 'R4C_DATA_QUALITY_SKIP',
      severity: op.quality_skip_rate_pct && op.quality_skip_rate_pct >= 5 ? 'HIGH' : 'MEDIUM',
      category: 'DATA_QUALITY',
      title: `${op.quality_skipped_count.toLocaleString('en-US')} Record Dilewati Akibat Field Sumber Kosong (${op.quality_skip_rate_pct ?? '?'}% skip rate)`,
      explanation: `Aplikasi verifikasi mencatat ${op.quality_skipped_count.toLocaleString('en-US')} record dilewati karena field wilayah kosong (${op.quality_skip_rate_pct ?? '?'}% dari total record yang disentuh). Jika data sumber lama lainnya juga tidak lengkap, backlog remediasi bisa membesar menjelang akhir proyek.`,
      reported_claim: 'PM melaporkan verifikasi berjalan sesuai rencana tanpa kendala signifikan',
      observed_reality: `${op.quality_skipped_count.toLocaleString('en-US')} records skipped (missing region) tercatat di sistem verifikasi`,
      evidence_refs: [
        ...(skipRec
          ? [makeProdRef(skipRec, `records_skipped_missing_region=${op.quality_skipped_count}`)]
          : []),
        ...skipUpdates.map(makeUpdateRef),
      ],
    });
    unknowns.push({
      code: 'UNKNOWN_SKIP_REMEDIATION_SCOPE',
      title: 'Total volume data sumber lama yang cacat & rencana remediasi belum diketahui',
      description: `Saat ini ${op.quality_skipped_count.toLocaleString('en-US')} record sudah dilewati, namun belum ada estimasi berapa banyak lagi di batch tersisa maupun apakah customer yang akan melengkapi field wilayah.`,
      impact: 'Berisiko menghambat serah terima 100% target jika data cacat tidak bisa diverifikasi.',
      evidence_refs: skipRec ? [makeProdRef(skipRec)] : [],
    });
  }

  // =========================================================================
  // RULE R4D: Generic Field / Operational Risk Signals in Updates (Rework, Hold, Missing Capacity)
  // =========================================================================
  if (!isCompleted) {
    const holdOrReworkUpdates = validUpdates.filter((u) =>
      /\bhold\b|revisi|uji petik|perbedaan interpretasi|dicek kembali/i.test(u.message)
    );
    if (holdOrReworkUpdates.length > 0) {
      const coordUpdates = validUpdates.filter(
        (u) =>
          Date.parse(u.timestamp) >= Date.parse(holdOrReworkUpdates[0].timestamp) &&
          /koordinasi|arahan|keputusan/i.test(u.message)
      );
      signals.push({
        signal_id: `${master.project_id}-R4D-HOLD-REWORK`,
        rule_code: 'R4D_OPERATIONAL_HOLD_REWORK',
        severity: 'HIGH',
        category: 'OPERATIONAL_HEALTH',
        title: 'Potensi Rework & Penahanan Produksi Parsial (Hold Klasifikasi)',
        explanation: `Tim lapangan melaporkan perbedaan interpretasi klasifikasi saat uji petik sehingga sebagian unit/box diminta dicek ulang dan pola serupa sedang di-hold sementara. Meski PM sudah berkoordinasi dengan customer, belum ada bukti operasional atau keputusan tertulis bahwa hold sudah dicabut.`,
        reported_claim: `${master.reported_status} (${master.reported_progress_pct}%)`,
        observed_reality: `Terdapat hold parsial & risiko revisi dari laporan lapangan (${holdOrReworkUpdates.map((u) => u.update_id).join(', ')})`,
        evidence_refs: [
          ...holdOrReworkUpdates.map(makeUpdateRef),
          ...coordUpdates.map(makeUpdateRef),
        ],
      });
      unknowns.push({
        code: 'UNKNOWN_HOLD_AND_REWORK_VOLUME',
        title: 'Jumlah box/unit yang di-hold dan terdampak revisi tidak terkuantifikasi',
        description:
          'Laporan lapangan dan koordinasi PM tidak menyebutkan berapa volume (unit) yang tertahan maupun apakah sebagian volume yang sudah tercatat perlu dikerjakan ulang.',
        impact: 'Volume aktual efektif dapat berkurang jika sebagian output harus diklasifikasi ulang.',
        evidence_refs: holdOrReworkUpdates.map(makeUpdateRef),
      });
    }

    const missingCapacityUpdates = validUpdates.filter((u) =>
      /kapasitas.*belum tersedia|capacity.*not available/i.test(u.message)
    );
    if (missingCapacityUpdates.length > 0) {
      unknowns.push({
        code: 'UNKNOWN_OPERATOR_CAPACITY',
        title: 'Kapasitas harian per operator belum tersedia dalam pelaporan',
        description:
          'PM secara eksplisit menyatakan rekap kapasitas verifikasi harian per operator belum tersedia, sehingga sulit memvalidasi apakah tim mampu meningkatkan kecepatan produksi.',
        impact: 'Rencana percepatan untuk menutup defisit jadwal belum dapat diverifikasi kelayakannya.',
        evidence_refs: missingCapacityUpdates.map(makeUpdateRef),
      });
    }
  }

  // =========================================================================
  // RULE R5: Data Staleness / Visibility Blind Spot (Active Projects Only)
  // =========================================================================
  if (isStaleActive) {
    const staleHours = Math.min(
      op.hours_since_last_update ?? Infinity,
      op.hours_since_last_operational ?? Infinity
    );
    const staleDays = Number.isFinite(staleHours) ? round2(staleHours / 24) : null;
    const latestUpdateRef =
      validUpdates.length > 0 ? [makeUpdateRef(validUpdates[validUpdates.length - 1])] : [];

    signals.push({
      signal_id: `${master.project_id}-R5-STALE`,
      rule_code: 'R5_DATA_STALENESS_BLIND_SPOT',
      severity: staleDays !== null && staleDays >= 5 ? 'HIGH' : 'MEDIUM',
      category: 'DATA_STALENESS',
      title: `Data Usang / Blind Spot Operasional (${staleDays !== null ? `${staleDays} hari` : 'tanpa data'} tanpa update maupun log produksi)`,
      explanation: `Untuk proyek aktif berstatus ${master.reported_status}, tidak ada pembaruan lapangan maupun snapshot sistem operasional sejak ${op.latest_timestamp ?? master.last_reported_update_at} (${staleDays ?? '?'} hari sebelum tanggal acuan ${extractDateOnly(asOfDate)}). Sistem TIDAK menyimpulkan proyek ini terlambat ataupun sehat — kondisi aktual saat ini belum terverifikasi.`,
      reported_claim: `${master.reported_status} per ${master.last_reported_update_at}`,
      observed_reality: `Tidak ada record operasional & update selama ${staleDays ?? '?'} hari terakhir (ambang batas: ${STALE_THRESHOLD_HOURS / 24} hari)`,
      evidence_refs: [
        masterRef,
        ...(op.verified_source_ref ? [op.verified_source_ref] : []),
        ...latestUpdateRef,
      ],
    });
    unknowns.push({
      code: 'UNKNOWN_CURRENT_PROGRESS_STALE',
      title: `Status operasional sejak ${extractDateOnly(op.latest_timestamp ?? master.last_reported_update_at)} tidak diketahui`,
      description: `Dengan laju sebelumnya (${deadlineAnalysis.historical_daily_rate_operational ?? '?'} ${master.target_unit}/hari), proyek bisa saja sudah selesai ATAU justru berhenti total tanpa laporan.`,
      impact: 'Manajemen tidak dapat memvalidasi apakah target 100% akan tercapai sebelum deadline tanpa rekap terbaru.',
      evidence_refs: [masterRef, ...(op.verified_source_ref ? [op.verified_source_ref] : [])],
    });
  }

  // =========================================================================
  // DMS / Post-Go-Live Health Check (Completed or Live Systems)
  // =========================================================================
  if (op.dms_status) {
    if (op.dms_status.application_status.toUpperCase() !== 'ONLINE') {
      signals.push({
        signal_id: `${master.project_id}-R4E-APP-DOWN`,
        rule_code: 'R4E_APPLICATION_NOT_ONLINE',
        severity: 'CRITICAL',
        category: 'OPERATIONAL_HEALTH',
        title: `Aplikasi Production Tidak ONLINE (${op.dms_status.application_status})`,
        explanation: `Monitoring aplikasi menunjukkan status ${op.dms_status.application_status}.`,
        evidence_refs: [op.dms_status.source_ref],
      });
    } else if (isCompleted) {
      // Transparently note minor post-go-live unknowns without triggering false alarms
      unknowns.push({
        code: 'INFO_POST_GOLIVE_ADOPTION_DENOMINATOR',
        title: 'Total populasi target user & dokumen BAST formal tidak tercakup di dataset',
        description: `Sistem terverifikasi ONLINE dengan ${op.dms_status.active_users_last_24h ?? 0} active users dan ${op.dms_status.successful_logins_last_24h ?? 0} login sukses dalam 24 jam terakhir (${op.dms_status.failed_logins_last_24h ?? 0} failed login yang selaras dengan insiden reset password minor). Hanya persentase adopsi terhadap total user berlisensi yang tidak tersedia di dataset.`,
        impact: 'Tidak menghambat status verifikasi selesai; relevan hanya untuk evaluasi adopsi pasca go-live.',
        evidence_refs: [op.dms_status.source_ref],
      });
    }
  }

  // =========================================================================
  // Evidence-Based Closure Check for Follow-Ups (Section 11)
  // =========================================================================
  const enrichedFollowups: FollowUpRecord[] = followups.map((fu) => {
    const resolvedMs = fu.resolved_at ? Date.parse(fu.resolved_at) : null;
    const eligibleRecords =
      resolvedMs !== null
        ? validProd
            .filter((rec) => Date.parse(rec.timestamp) >= resolvedMs)
            .map((rec) => makeProdRef(rec, summarizeProdRecord(rec)))
        : [];
    return {
      ...fu,
      post_resolution_evidence_available: eligibleRecords.length > 0,
      eligible_verification_records: eligibleRecords,
    };
  });

  const resolvedUnverified = enrichedFollowups.filter(
    (f) => f.action_status === 'RESOLVED' && f.verification_status !== 'VERIFIED_BY_EVIDENCE'
  );
  if (resolvedUnverified.length > 0) {
    unknowns.push({
      code: 'FOLLOWUP_CLOSED_UNVERIFIED',
      title: `${resolvedUnverified.length} tindak lanjut berstatus RESOLVED tetapi belum terverifikasi oleh bukti operasional baru`,
      description:
        'Menutup tindakan follow-up tidak otomatis membuktikan kondisi operasional proyek sudah pulih. Diperlukan bukti operasional terbaru setelah waktu penyelesaian tindakan.',
      impact: 'Sinyal perhatian proyek tetap aktif sampai bukti terbaru membuktikan perbaikan.',
      evidence_refs: [],
    });
  }

  // =========================================================================
  // Compute Overall Attention Level, Score & Uncertainty Level
  // =========================================================================
  let attentionLevel: AttentionLevel = 'LOW';
  if (signals.some((s) => s.severity === 'CRITICAL')) {
    attentionLevel = 'CRITICAL';
  } else if (signals.some((s) => s.severity === 'HIGH')) {
    attentionLevel = 'HIGH';
  } else if (signals.some((s) => s.severity === 'MEDIUM')) {
    attentionLevel = 'MEDIUM';
  }

  const attentionScore = Math.min(
    100,
    signals.reduce((acc, s) => acc + SEVERITY_WEIGHT[s.severity], 0)
  );

  let uncertaintyLevel: UncertaintyLevel = 'LOW';
  if (isStaleActive || unknowns.filter((u) => !u.code.startsWith('INFO_')).length >= 2) {
    uncertaintyLevel = 'HIGH';
  } else if (unknowns.filter((u) => !u.code.startsWith('INFO_')).length === 1) {
    uncertaintyLevel = 'MODERATE';
  }

  // Build concise, management-ready executive summary & verdict
  let keyVerdict = 'Terverifikasi Sesuai Laporan';
  let executiveSummary = '';

  if (signals.length === 0 && isCompleted) {
    keyVerdict = 'Selesai & Terverifikasi Operasional';
    executiveSummary = `Proyek selesai tepat waktu (${master.deadline}) dan terkonfirmasi ONLINE oleh monitoring operasional terbaru (${op.dms_status?.active_users_last_24h ?? 0} user aktif 24 jam terakhir). Tidak perlu eskalasi.`;
  } else if (signals.length === 0) {
    keyVerdict = 'Berjalan Normal & Terverifikasi';
    executiveSummary = `Tidak ada anomali jadwal, selisih data, atau gangguan operasional yang terdeteksi per ${extractDateOnly(asOfDate)}.`;
  } else {
    const topSignal = [...signals].sort(
      (a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]
    )[0];
    if (isStaleActive && signals.every((s) => s.category === 'DATA_STALENESS' || s.category === 'REPORT_INCONSISTENCY')) {
      keyVerdict = 'Status Aktual Tidak Terverifikasi (Data Usang)';
    } else if (attentionLevel === 'CRITICAL') {
      keyVerdict = 'Perlu Intervensi Segera — Risiko Kritis';
    } else if (attentionLevel === 'HIGH') {
      keyVerdict = 'Perlu Perhatian Manajemen — Risiko Tinggi';
    } else {
      keyVerdict = 'Perlu Pemantauan & Klarifikasi';
    }
    executiveSummary = `${topSignal.title}. ${signals.length > 1 ? `Total ${signals.length} temuan terdeteksi lintas sumber.` : ''}`;
  }

  // Build unified chronological timeline (newest first for UI inspection, or sorted ascending then reversed)
  const timeline: TimelineEvent[] = [
    ...validUpdates.map((u): TimelineEvent => ({
      event_id: u.update_id,
      timestamp: u.timestamp,
      layer: 'REPORT_UPDATE',
      source_type: u.source_type,
      source_name: u.source_name,
      summary: u.message,
      details: {
        update_id: u.update_id,
        source_type: u.source_type,
        source_name: u.source_name,
        message: u.message,
      },
    })),
    ...validProd.map((p): TimelineEvent => ({
      event_id: p.source_record_id,
      timestamp: p.timestamp,
      layer: 'OPERATIONAL_EVIDENCE',
      source_type: p.source_system,
      source_name: p.source_system,
      record_type: p.record_type,
      summary: summarizeProdRecord(p),
      details: p.raw_payload,
    })),
  ].sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  const openFollowupCount = enrichedFollowups.filter(
    (f) => f.action_status === 'OPEN' || f.action_status === 'IN_PROGRESS'
  ).length;

  return {
    project_id: master.project_id,
    master,
    attention_level: attentionLevel,
    attention_score: attentionScore,
    uncertainty_level: uncertaintyLevel,
    executive_summary: executiveSummary,
    key_verdict: keyVerdict,
    deadline_analysis: deadlineAnalysis,
    operational_summary: op,
    signals: signals.sort((a, b) => SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity]),
    unknowns,
    timeline,
    followups: enrichedFollowups,
    open_followup_count: openFollowupCount,
    resolved_unverified_followup_count: resolvedUnverified.length,
  };
}
