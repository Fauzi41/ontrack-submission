import { describe, expect, it } from 'vitest';
import {
  addCalendarDays,
  computeDeadlineAnalysis,
  diffCalendarDays,
  diffHours,
  extractDateOnly,
  extractStatedDailyCapacity,
} from '../backend/src/deadlineEngine.js';
import type { ProjectMasterRecord, ProjectUpdateRecord } from '../backend/src/types.js';

function makeMaster(overrides: Partial<ProjectMasterRecord> = {}): ProjectMasterRecord {
  return {
    project_id: 'PRJ-TEST',
    customer: 'Test Customer',
    project_name: 'Test Project',
    project_type: 'Document Digitalisation',
    pic: 'Raka',
    start_date: '2026-09-01',
    deadline: '2026-10-11',
    target: 400,
    target_unit: 'ML',
    reported_actual: 200,
    reported_progress_pct: 50,
    reported_status: 'ON TRACK',
    last_reported_update_at: '2026-10-01T12:00:00',
    ...overrides,
  };
}

describe('deadlineEngine.ts — Calendar Math, Capacity Parsing & Feasibility Verdicts (26 tests)', () => {
  // Date helpers (8 tests)
  it('1. extractDateOnly slices YYYY-MM-DD from full ISO timestamp', () => {
    expect(extractDateOnly('2026-10-06T17:00:00')).toBe('2026-10-06');
  });

  it('2. diffCalendarDays computes positive span accurately across month boundary', () => {
    expect(diffCalendarDays('2026-09-01', '2026-10-15')).toBe(44);
    expect(diffCalendarDays('2026-09-10', '2026-10-10')).toBe(30);
  });

  it('3. diffCalendarDays computes negative days when deadline passed', () => {
    expect(diffCalendarDays('2026-10-10', '2026-10-06')).toBe(-4);
  });

  it('4. diffCalendarDays returns 0 for identical calendar dates regardless of time', () => {
    expect(diffCalendarDays('2026-10-06T08:00:00', '2026-10-06T23:59:00')).toBe(0);
  });

  it('5. addCalendarDays advances across month end cleanly', () => {
    expect(addCalendarDays('2026-10-06', 30)).toBe('2026-11-05');
    expect(addCalendarDays('2026-10-06', 10)).toBe('2026-10-16');
  });

  it('6. diffHours computes exact fractional hours between timestamps', () => {
    expect(diffHours('2026-09-30T17:00:00', '2026-10-06T17:00:00')).toBe(144);
    expect(diffHours('2026-10-05T23:59:00', '2026-10-06T08:10:00')).toBe(8.18);
  });

  it('7. diffHours returns 0 safely on invalid timestamp input', () => {
    expect(diffHours('bad', '2026-10-06T17:00:00')).toBe(0);
  });

  it('8. addCalendarDays handles negative offset', () => {
    expect(addCalendarDays('2026-10-06', -6)).toBe('2026-09-30');
  });

  // Capacity regex extraction (5 tests)
  it('9. extracts Indonesian dotted-thousand capacity ("4.500 halaman per hari")', () => {
    const updates: ProjectUpdateRecord[] = [
      {
        update_id: 'UPD-008',
        project_id: 'PRJ-002',
        timestamp: '2026-10-04T17:15:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'Nadia',
        message: 'Rata-rata kapasitas tim sekitar 4.500 halaman per hari.',
      },
    ];
    expect(extractStatedDailyCapacity(updates)).toEqual({ capacity: 4500, refId: 'UPD-008' });
  });

  it('10. extracts English comma-thousand capacity ("capacity ~6,000 pages/day")', () => {
    const updates: ProjectUpdateRecord[] = [
      {
        update_id: 'UPD-EN-1',
        project_id: 'PRJ-X',
        timestamp: '2026-10-05T10:00:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'PM',
        message: 'Current team capacity is 6,000 pages/day.',
      },
    ];
    expect(extractStatedDailyCapacity(updates)).toEqual({ capacity: 6000, refId: 'UPD-EN-1' });
  });

  it('11. selects the chronologically latest capacity update when multiple exist', () => {
    const updates: ProjectUpdateRecord[] = [
      {
        update_id: 'UPD-OLD',
        project_id: 'PRJ-002',
        timestamp: '2026-10-04T10:00:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'Nadia',
        message: 'Kapasitas tim sekitar 4.500 halaman per hari.',
      },
      {
        update_id: 'UPD-NEW',
        project_id: 'PRJ-002',
        timestamp: '2026-10-06T16:00:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'Nadia',
        message: 'Kapasitas tim meningkat menjadi 9.000 halaman per hari.',
      },
    ];
    expect(extractStatedDailyCapacity(updates)).toEqual({ capacity: 9000, refId: 'UPD-NEW' });
  });

  it('12. returns null when updates state capacity is unavailable', () => {
    const updates: ProjectUpdateRecord[] = [
      {
        update_id: 'UPD-023',
        project_id: 'PRJ-004',
        timestamp: '2026-10-06T16:10:00',
        source_type: 'PROJECT_MANAGER',
        source_name: 'Sari',
        message: 'Rekap kapasitas verifikasi harian per operator belum tersedia dalam laporan ini.',
      },
    ];
    expect(extractStatedDailyCapacity(updates)).toBeNull();
  });

  it('13. returns null on empty update list', () => {
    expect(extractStatedDailyCapacity([])).toBeNull();
  });

  // Feasibility Verdicts & Step-by-step Calculations (13 tests)
  it('14. computes COMPLETED_ON_TIME when completed on or before deadline', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-07-01',
        deadline: '2026-09-30',
        target: 1,
        target_unit: 'system',
        reported_actual: 1,
        reported_progress_pct: 100,
        reported_status: 'COMPLETED',
        last_reported_update_at: '2026-09-30T16:00:00',
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 1,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-06T16:45:00',
      updates: [],
    });
    expect(res.feasibility_verdict).toBe('COMPLETED_ON_TIME');
    expect(res.total_duration_days).toBe(91);
    expect(res.calculation_steps).toHaveLength(3);
  });

  it('15. computes COMPLETED_LATE when completed after deadline', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        deadline: '2026-09-30',
        reported_status: 'COMPLETED',
        last_reported_update_at: '2026-10-03T16:00:00',
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 400,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-03T16:00:00',
      updates: [],
    });
    expect(res.feasibility_verdict).toBe('COMPLETED_LATE');
  });

  it('16. computes OVERDUE when active project passes deadline', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({ deadline: '2026-10-04' }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 200,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-06T10:00:00',
      updates: [],
    });
    expect(res.remaining_days).toBe(-2);
    expect(res.feasibility_verdict).toBe('OVERDUE');
    expect(res.required_daily_rate_operational).toBeNull();
  });

  it('17. computes INSUFFICIENT_DATA for active stale project and preserves snapshot elapsed denominator', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-08-15',
        deadline: '2026-10-20',
        target: 2000,
        target_unit: 'boxes',
        reported_actual: 1840,
        reported_progress_pct: 94,
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 1840,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-09-30T17:00:00',
      updates: [],
      isStaleActive: true,
    });
    expect(res.feasibility_verdict).toBe('INSUFFICIENT_DATA');
    expect(res.historical_daily_rate_operational).toBe(40); // 1840 / 46 days (up to Sept 30)
    expect(res.computed_reported_pct).toBe(92);
  });

  it('18. computes MATHEMATICALLY_INFEASIBLE when required pace exceeds stated max capacity by >15%', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-09-10',
        deadline: '2026-10-10',
        target: 120000,
        target_unit: 'pages',
        reported_actual: 91500,
        reported_progress_pct: 76.25,
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 87240,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-05T23:59:00',
      updates: [
        {
          update_id: 'UPD-008',
          project_id: 'PRJ-002',
          timestamp: '2026-10-04T17:15:00',
          source_type: 'PROJECT_MANAGER',
          source_name: 'Nadia',
          message: 'Rata-rata kapasitas tim sekitar 4.500 halaman per hari.',
        },
      ],
    });
    expect(res.feasibility_verdict).toBe('MATHEMATICALLY_INFEASIBLE');
    expect(res.required_daily_rate_operational).toBe(8190);
    expect(res.required_daily_rate_reported).toBe(7125);
    expect(res.projected_completion_at_stated_capacity).toBe('2026-10-14');
    expect(res.projected_slip_at_stated_capacity).toBe(4);
    expect(res.calculation_steps).toHaveLength(7);
  });

  it('19. computes MATHEMATICALLY_INFEASIBLE when operational acceleration >= 1.75x even without stated capacity', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-09-01',
        deadline: '2026-10-11',
        target: 400,
        reported_actual: 200,
        reported_progress_pct: 50,
      }),
      asOfDate: '2026-10-01T17:00:00',
      operationalVerifiedActual: 180,
      operationalPendingActual: 20,
      operationalSnapshotDate: '2026-10-01T12:00:00',
      updates: [],
    });
    expect(res.acceleration_factor_operational).toBe(3.67);
    expect(res.feasibility_verdict).toBe('MATHEMATICALLY_INFEASIBLE');
  });

  it('20. computes AT_HIGH_RISK when operational verified is 0 and remaining_days <= 10', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-09-01',
        deadline: '2026-10-13',
        target: 10,
        target_unit: 'endpoints',
        reported_actual: 9,
        reported_progress_pct: 90,
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 0,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-06T07:30:00',
      updates: [],
    });
    expect(res.feasibility_verdict).toBe('AT_HIGH_RISK');
    expect(res.projected_completion_date_operational).toBeNull();
  });

  it('21. computes AT_HIGH_RISK for PRJ-004 pace deficit (+13 days projected slip)', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-09-01',
        deadline: '2026-11-05',
        target: 100000,
        target_unit: 'records',
        reported_actual: 45000,
        reported_progress_pct: 52,
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 45000,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-06T07:00:00',
      updates: [],
    });
    expect(res.feasibility_verdict).toBe('AT_HIGH_RISK');
    expect(res.historical_daily_rate_operational).toBe(1285.71);
    expect(res.required_daily_rate_operational).toBe(1833.33);
    expect(res.acceleration_factor_operational).toBe(1.43);
    expect(res.projected_completion_date_operational).toBe('2026-11-18');
    expect(res.projected_slip_days_operational).toBe(13);
  });

  it('22. computes PRESSURED for PRJ-001 verified pace (10.94 vs 8.61 ML/day = 1.27x)', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-09-01',
        deadline: '2026-10-15',
        target: 400,
        target_unit: 'ML',
        reported_actual: 318,
        reported_progress_pct: 79.5,
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 301.5,
      operationalPendingActual: 16.5,
      operationalSnapshotDate: '2026-10-05T18:00:00',
      updates: [],
    });
    expect(res.feasibility_verdict).toBe('PRESSURED');
    expect(res.acceleration_factor_operational).toBe(1.27);
    expect(res.projected_slip_days_operational).toBe(3);
  });

  it('23. computes FEASIBLE_IF_CURRENT when operational pace meets or exceeds required pace', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({
        start_date: '2026-09-01',
        deadline: '2026-10-15',
        target: 400,
        reported_actual: 360,
        reported_progress_pct: 90,
      }),
      asOfDate: '2026-10-06T17:00:00',
      operationalVerifiedActual: 360,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-06T12:00:00',
      updates: [],
    });
    expect(res.feasibility_verdict).toBe('FEASIBLE_IF_CURRENT');
    expect(res.acceleration_factor_operational).toBeLessThan(1);
    expect(res.projected_slip_days_operational).toBeLessThanOrEqual(0);
  });

  it('24. handles null operationalVerifiedActual gracefully by falling back to reported metrics', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({ reported_actual: 350, target: 400, reported_progress_pct: 87.5 }),
      asOfDate: '2026-10-01T17:00:00',
      operationalVerifiedActual: null,
      operationalPendingActual: null,
      operationalSnapshotDate: null,
      updates: [],
    });
    expect(res.operational_verified_pct).toBeNull();
    expect(res.required_daily_rate_reported).toBe(5);
    expect(res.calculation_steps).toHaveLength(6);
  });

  it('25. flags arithmetic discrepancy note inside Step 3 when reported_progress_pct mismatches computed %', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({ target: 1000, reported_actual: 450, reported_progress_pct: 52 }),
      asOfDate: '2026-10-01T17:00:00',
      operationalVerifiedActual: 450,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-01T10:00:00',
      updates: [],
    });
    expect(res.calculation_steps[2].note).toContain('selisih aritmetika');
  });

  it('26. clamps remaining volume to 0 if actual exceeds target', () => {
    const res = computeDeadlineAnalysis({
      master: makeMaster({ target: 100, reported_actual: 110, reported_progress_pct: 110 }),
      asOfDate: '2026-10-01T17:00:00',
      operationalVerifiedActual: 110,
      operationalPendingActual: null,
      operationalSnapshotDate: '2026-10-01T10:00:00',
      updates: [],
    });
    expect(res.remaining_volume_reported).toBe(0);
    expect(res.remaining_volume_operational).toBe(0);
  });
});
