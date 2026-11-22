import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/interpret/context.js';
import {
  blockedDependency,
  capacityDegradation,
  closureEvidence,
  internalInconsistency,
  progressBasisConflict,
  progressGap,
  qualityGap,
  scheduleRisk,
  staleData,
  statusContradiction,
} from '../src/interpret/detectors.js';
import { facts, master, value } from './helpers.js';

describe('progress_gap', () => {
  it('membedakan selisih yang dijelaskan antrean dari yang tidak', () => {
    const ctx = buildContext(
      facts({ target: 1000, target_unit: 'ML', reported_actual: 900 }, [
        master('reported_actual', 900),
        value('verified_quantity', 880, { unit: 'ML' }),
        value('pending_internal_check_quantity', 20, { unit: 'ML' }),
      ]),
    );
    const [found] = progressGap(ctx);
    expect(found?.detector).toBe('progress_gap');
    expect(found?.severity).toBe('watch');
    expect(found?.reason).toContain('dijelaskan');
  });

  it('menaikkan severity saat selisih tidak diakui sumber mana pun', () => {
    const ctx = buildContext(
      facts({ target: 1000, target_unit: 'ML', reported_actual: 900 }, [
        master('reported_actual', 900),
        value('verified_quantity', 800, { unit: 'ML' }),
      ]),
    );
    const [found] = progressGap(ctx);
    expect(found?.severity).toBe('critical');
    expect(found?.reason).toContain('tidak diakui');
  });

  it('tidak menyala saat angka sepakat', () => {
    const ctx = buildContext(
      facts({ target: 1000, target_unit: 'pages', reported_actual: 900 }, [
        master('reported_actual', 900),
        value('pages_processed_total', 900),
      ]),
    );
    expect(progressGap(ctx)).toEqual([]);
  });

  it('menyerahkan perbandingan ke detektor lain bila basisnya penerimaan production', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints' }, [
        master('reported_actual', 9),
        value('production_tested_endpoints', 0),
      ], { progress_basis: 'accepted_in_production' }),
    );
    expect(progressGap(ctx)).toEqual([]);
  });
});

describe('schedule_risk', () => {
  const borderline = (): ReturnType<typeof facts> =>
    facts({ target: 400, target_unit: 'ML', reported_actual: 318, reported_progress_pct: 79.5 }, [
      master('reported_actual', 318),
      value('verified_quantity', 301.5, { unit: 'ML' }),
      value('pending_internal_check_quantity', 16.5, { unit: 'ML' }),
    ]);

  it('menandai borderline saat dua basis memberi kesimpulan berbeda', () => {
    const [found] = scheduleRisk(buildContext(borderline()));
    expect(found?.borderline).toBe(true);
    expect(found?.severity).toBe('attention');
    expect(found?.confidence).toBe('medium');
    expect(found?.reason).toContain('berbeda tergantung basis');
  });

  it('tidak memaksa kritis pada kasus borderline', () => {
    const [found] = scheduleRisk(buildContext(borderline()));
    expect(found?.severity_final).not.toBe('critical');
  });

  it('kritis saat kedua basis sepakat tertinggal jauh', () => {
    const ctx = buildContext(
      facts({ target: 120000, reported_actual: 91500, reported_progress_pct: 76.25, deadline: '2026-10-10', start_date: '2026-09-10' }, [
        master('reported_actual', 91500),
        value('pages_processed_total', 87240),
      ]),
    );
    const [found] = scheduleRisk(ctx);
    expect(found?.severity).toBe('critical');
    expect(found?.confidence).toBe('high');
  });

  it('menolak menghitung laju untuk pekerjaan diskrit', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints' }, [master('reported_actual', 9)], { rate_model: 'discrete' }),
    );
    expect(scheduleRisk(ctx)).toEqual([]);
  });

  it('tidak menghitung apa pun saat deadline tidak ada', () => {
    const ctx = buildContext(facts({ deadline: null }, [master('reported_actual', 900)]));
    expect(scheduleRisk(ctx)).toEqual([]);
    expect(ctx.timePressure).toBe('UNKNOWN');
  });

  it('melaporkan deadline yang lewat sebagai masalah status, bukan diam saja', () => {
    const ctx = buildContext(
      facts({ target: 1000, deadline: '2026-09-30', reported_status: 'ON TRACK' }, [master('reported_actual', 900)]),
    );
    expect(ctx.timePressure).toBe('OVERDUE');
    const [found] = scheduleRisk(ctx);
    expect(found?.detector).toBe('deadline_passed');
    expect(found?.severity).toBe('critical');
    expect(found?.reason).toContain('masih ON TRACK');
  });
});

describe('stale_data', () => {
  it('memakai batas dua kali cadence untuk menaikkan severity', () => {
    const fresh = buildContext(
      facts({}, [master('reported_actual', 900), value('pages_processed_total', 900)]),
    );
    expect(staleData(fresh)).toEqual([]);

    const stale = buildContext(
      facts({}, [value('reported_actual', 900, {
        source_kind: 'MASTER',
        provenance: 'REPORTED',
        observed_at: '2026-09-30T17:00:00',
      })]),
    );
    const out = staleData(stale);
    expect(out.map((f) => f.detector)).toEqual(['stale_report']);
    expect(out[0]?.severity).toBe('watch');
  });
});

describe('blocked_dependency', () => {
  it('membaca null sebagai belum pernah berhasil dan menunjuk customer', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints' }, [
        value('developed_endpoints', 9),
        value('production_tested_endpoints', 0),
        value('connection_status', 'NOT_CONFIGURED'),
        value('last_successful_connection', null),
      ]),
    );
    const [found] = blockedDependency(ctx);
    expect(found?.severity).toBe('critical');
    expect(found?.owner).toBe('CUSTOMER');
    expect(found?.reason).toContain('belum pernah');
  });
});

describe('quality_gap', () => {
  it('menghitung porsi record yang tidak masuk target', () => {
    const ctx = buildContext(
      facts({ target: 100000, target_unit: 'records' }, [
        master('reported_actual', 45000),
        value('records_verified', 45000, { unit: 'records' }),
        value('records_skipped_missing_region', 3200, { unit: 'records' }),
      ]),
    );
    const [found] = qualityGap(ctx);
    expect(found?.severity).toBe('watch');
    expect(found?.reason).toContain('3.200');
  });
});

describe('capacity_degradation', () => {
  it('membedakan membaik dari tetap rusak, dan tidak menskalakan kapasitas', () => {
    const ctx = buildContext(
      facts({}, [
        master('reported_actual', 900),
        value('scanners', JSON.stringify([
          { scanner_id: 'SCN-A', status: 'RUNNING' },
          { scanner_id: 'SCN-B', status: 'OUT_OF_SERVICE' },
        ]), { observed_at: '2026-10-06T09:05:00' }),
        value('scanners', JSON.stringify([
          { scanner_id: 'SCN-A', status: 'RUNNING' },
          { scanner_id: 'SCN-B', status: 'LIMITED' },
        ]), { observed_at: '2026-10-06T15:30:00' }),
      ]),
    );
    const [found] = capacityDegradation(ctx);
    expect(found?.severity).toBe('watch');
    expect(found?.owner).toBe('PROJECT_MANAGER');
    expect(found?.reason).toContain('membaik');
  });

  it('mengambil jam pembanding dari data, bukan dari teks yang ditulis tangan', () => {
    const ctx = buildContext(
      facts({}, [
        master('reported_actual', 900),
        value('scanners', JSON.stringify([{ scanner_id: 'A', status: 'OUT_OF_SERVICE' }]), {
          observed_at: '2026-10-06T09:05:00',
        }),
        value('scanners', JSON.stringify([{ scanner_id: 'A', status: 'LIMITED' }]), {
          observed_at: '2026-10-06T15:30:00',
        }),
      ]),
    );
    const [found] = capacityDegradation(ctx);
    expect(found?.reason).toContain('09:05');
    expect(found?.reason).not.toContain('08:15');
  });
});

describe('closure', () => {
  it('memakai waktu deployment, bukan pemeriksaan kesehatan terakhir', () => {
    const ctx = buildContext(
      facts({ target: 1, target_unit: 'system', reported_status: 'COMPLETED', deadline: '2026-09-30', reported_actual: 1 }, [
        master('reported_actual', 1),
        value('deployment_status', 'COMPLETED', { observed_at: '2026-09-30T16:05:00' }),
        value('application_status', 'ONLINE', { observed_at: '2026-10-06T16:45:00' }),
        value('successful_logins_last_24h', 21),
      ]),
    );
    const [found] = closureEvidence(ctx);
    expect(found?.detector).toBe('verified_closure');
    expect(found?.severity).toBe('info');
    expect(found?.reason).toContain('tepat waktu');
  });

  it('menandai klaim selesai tanpa bukti operasional', () => {
    const ctx = buildContext(
      facts({ target: 1, target_unit: 'system', reported_status: 'COMPLETED', reported_actual: 1 }, [
        master('reported_actual', 1),
        value('deployment_status', 'COMPLETED', { observed_at: '2026-09-30T16:05:00' }),
      ]),
    );
    const [found] = closureEvidence(ctx);
    expect(found?.detector).toBe('closure_evidence_missing');
    expect(found?.severity).toBe('attention');
  });

  it('tidak mengarang ketepatan waktu saat waktu selesai tidak tercatat', () => {
    const ctx = buildContext(
      facts({ target: 1, target_unit: 'system', reported_status: 'COMPLETED', reported_actual: 1 }, [
        master('reported_actual', 1),
        value('application_status', 'ONLINE', { observed_at: '2026-10-06T16:45:00' }),
      ]),
    );
    const [found] = closureEvidence(ctx);
    expect(found?.reason).toContain('tidak tercatat');
    expect(found?.reason).not.toContain('tepat waktu');
  });
});

describe('internal_inconsistency', () => {
  it('menyebut kedua angka yang bertentangan', () => {
    const watch = buildContext(
      facts({ target: 2000, target_unit: 'boxes', reported_actual: 1840, reported_progress_pct: 94 }, [
        master('reported_actual', 1840),
        master('reported_progress_pct', 94),
      ]),
    );
    const [found] = internalInconsistency(watch);
    expect(found?.severity).toBe('watch');
    expect(found?.reason).toContain('92%');
  });

  it('naik ke perhatian saat selisihnya besar', () => {
    const ctx = buildContext(
      facts({ target: 100000, target_unit: 'records', reported_actual: 45000, reported_progress_pct: 52 }, [
        master('reported_actual', 45000),
        master('reported_progress_pct', 52),
      ]),
    );
    expect(internalInconsistency(ctx)[0]?.severity).toBe('attention');
  });
});

describe('status_contradiction', () => {
  it('menyala saat progress penuh tapi status belum selesai', () => {
    const ctx = buildContext(
      facts({ target: 1000, reported_actual: 1000, reported_progress_pct: 100, reported_status: 'ON TRACK' }, [
        master('reported_actual', 1000),
        master('reported_progress_pct', 100),
      ]),
    );
    const [found] = statusContradiction(ctx);
    expect(found?.severity).toBe('attention');
    expect(found?.reason).toContain('ON TRACK');
  });
});

describe('progress_basis_conflict', () => {
  it('menolak menyebut pengembangan sebagai kemajuan', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints', reported_actual: 9, reported_progress_pct: 90 }, [
        master('reported_actual', 9),
        master('reported_progress_pct', 90),
        value('developed_endpoints', 9),
        value('production_tested_endpoints', 0),
      ], { progress_basis: 'accepted_in_production' }),
    );
    const [found] = progressBasisConflict(ctx);
    expect(found?.severity).toBe('critical');
    expect(found?.reason).toContain('belum bisa disebut kemajuan');
  });
});
