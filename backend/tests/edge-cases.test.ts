import { describe, expect, it } from 'vitest';
import { buildContext } from '../src/interpret/context.js';
import {
  blockedDependency,
  capacityDegradation,
  closureEvidence,
  internalInconsistency,
  progressBasisConflict,
  scheduleRisk,
  sourceConflict,
  statusContradiction,
} from '../src/interpret/detectors.js';
import { evaluateProject } from '../src/interpret/engine.js';
import { facts, master, value } from './helpers.js';

describe('batas waktu', () => {
  it('menandai due today saat deadline jatuh pada hari yang sama', () => {
    const ctx = buildContext(facts({ deadline: '2026-10-06' }, [master('reported_actual', 900)]));
    expect(ctx.timePressure).toBe('DUE_TODAY');
  });

  it('tidak menyebut overdue untuk proyek yang sudah selesai', () => {
    const ctx = buildContext(
      facts({ deadline: '2026-09-30', reported_status: 'COMPLETED' }, [master('reported_actual', 900)]),
    );
    expect(ctx.timePressure).toBe('NONE');
    expect(ctx.overdueDays).toBeNull();
  });

  it('tidak menghitung laju bila tanggal mulai tidak ada', () => {
    const ctx = buildContext(facts({ start_date: null }, [master('reported_actual', 900)]));
    expect(ctx.elapsedDays).toBeNull();
    expect(scheduleRisk(ctx)).toEqual([]);
  });
});

describe('schedule_risk', () => {
  it('tidak menyala saat laju sudah lebih cepat dari yang dibutuhkan', () => {
    const ctx = buildContext(facts({ target: 1000, reported_actual: 900 }, [master('reported_actual', 900)]));
    expect(scheduleRisk(ctx)).toEqual([]);
  });

  it('memberi saran yang sesuai untuk perhatian, bukan saran untuk kritis', () => {
    const ctx = buildContext(facts({ target: 1000, reported_actual: 770 }, [master('reported_actual', 770)]));
    const [found] = scheduleRisk(ctx);
    expect(found?.severity).toBe('attention');
    expect(found?.action).toContain('satu hari kerja');
    expect(found?.action).not.toContain('tidak bisa ditutup');
  });
});

describe('blocked_dependency', () => {
  it('membedakan belum pernah terhubung dari sudah terhubung tapi belum diuji', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints' }, [
        value('developed_endpoints', 9),
        value('production_tested_endpoints', 0),
        value('connection_status', 'CONNECTED'),
        value('last_successful_connection', '2026-10-05T10:00:00'),
      ]),
    );
    const [found] = blockedDependency(ctx);
    expect(found?.reason).toContain('yang diuji di production');
    expect(found?.reason).not.toContain('belum pernah');
  });

  it('tidak menyala saat semua endpoint sudah diuji', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints' }, [
        value('developed_endpoints', 9),
        value('production_tested_endpoints', 9),
        value('connection_status', 'CONNECTED'),
      ]),
    );
    expect(blockedDependency(ctx)).toEqual([]);
  });
});

describe('capacity_degradation', () => {
  it('kritis dan menunjuk vendor saat semua unit mati', () => {
    const ctx = buildContext(
      facts({}, [
        master('reported_actual', 900),
        value('scanners', JSON.stringify([{ status: 'OUT_OF_SERVICE' }, { status: 'DOWN' }])),
      ]),
    );
    const [found] = capacityDegradation(ctx);
    expect(found?.severity).toBe('critical');
    expect(found?.owner).toBe('VENDOR');
  });

  it('perhatian saat tidak ada pembanding sebelumnya', () => {
    const ctx = buildContext(
      facts({}, [
        master('reported_actual', 900),
        value('scanners', JSON.stringify([{ status: 'RUNNING' }, { status: 'LIMITED' }])),
      ]),
    );
    const [found] = capacityDegradation(ctx);
    expect(found?.severity).toBe('attention');
    expect(found?.evidence).toHaveLength(1);
  });

  it('tidak gagal saat isi snapshot bukan JSON', () => {
    const ctx = buildContext(
      facts({}, [master('reported_actual', 900), value('scanners', '{rusak')]),
    );
    expect(capacityDegradation(ctx)).toEqual([]);
  });

  it('diam saat semua unit normal', () => {
    const ctx = buildContext(
      facts({}, [master('reported_actual', 900), value('scanners', JSON.stringify([{ status: 'RUNNING' }]))]),
    );
    expect(capacityDegradation(ctx)).toEqual([]);
  });
});

describe('closure', () => {
  it('menyebut penutupan setelah tanggal yang dijanjikan', () => {
    const ctx = buildContext(
      facts({ target: 1, target_unit: 'system', reported_status: 'COMPLETED', deadline: '2026-09-30', reported_actual: 1 }, [
        master('reported_actual', 1),
        value('deployment_status', 'COMPLETED', { observed_at: '2026-10-02T09:00:00' }),
        value('application_status', 'ONLINE', { observed_at: '2026-10-06T16:45:00' }),
      ]),
    );
    const [found] = closureEvidence(ctx);
    expect(found?.reason).toContain('setelah tanggal yang dijanjikan');
  });

  it('diam untuk proyek yang belum selesai', () => {
    expect(closureEvidence(buildContext(facts({ reported_status: 'ON TRACK' }, [master('reported_actual', 900)])))).toEqual([]);
  });
});

describe('internal_inconsistency', () => {
  it('mentoleransi selisih di bawah satu poin', () => {
    const ctx = buildContext(
      facts({ target: 1000, reported_actual: 800, reported_progress_pct: 80.5 }, [
        master('reported_actual', 800),
        master('reported_progress_pct', 80.5),
      ]),
    );
    expect(internalInconsistency(ctx)).toEqual([]);
  });
});

describe('status_contradiction', () => {
  it('kritis saat proyek ditutup padahal bukti verifikasi belum penuh', () => {
    const ctx = buildContext(
      facts({ target: 100, target_unit: 'ML', reported_actual: 40, reported_progress_pct: 40, reported_status: 'COMPLETED' }, [
        master('reported_actual', 40),
        master('reported_progress_pct', 40),
        master('reported_status', 0),
        value('verified_quantity', 40, { unit: 'ML' }),
      ]),
    );
    const [found] = statusContradiction(ctx);
    expect(found?.severity).toBe('critical');
    expect(found?.reason).toContain('40');
  });

  it('diam saat status dan angka sejalan', () => {
    const ctx = buildContext(
      facts({ target: 1000, reported_actual: 500, reported_progress_pct: 50 }, [
        master('reported_actual', 500),
        master('reported_progress_pct', 50),
      ]),
    );
    expect(statusContradiction(ctx)).toEqual([]);
  });
});

describe('progress_basis_conflict', () => {
  it('diam bila belum ada endpoint yang dibangun', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints' }, [value('developed_endpoints', 0)], {
        progress_basis: 'accepted_in_production',
      }),
    );
    expect(progressBasisConflict(ctx)).toEqual([]);
  });
});

describe('source_conflict', () => {
  it('tidak dipakai untuk proyek berbasis penerimaan production', () => {
    const ctx = buildContext(
      facts({ target: 10, target_unit: 'endpoints' }, [
        master('reported_actual', 9),
        value('production_tested_endpoints', 0),
      ], { progress_basis: 'accepted_in_production' }),
    );
    expect(sourceConflict(ctx)).toEqual([]);
  });
});

describe('evaluateProject', () => {
  it('memberi narasi jujur saat tidak ada data yang bisa dinilai', () => {
    const assessment = evaluateProject(
      facts({ deadline: null, reported_status: 'ON TRACK', target: null, reported_actual: null }, []),
    );
    expect(assessment.findings).toEqual([]);
    expect(assessment.top_severity).toBe('info');
    expect(assessment.rank).toBeNull();
    expect(assessment.narrative).toContain('Tidak ada masalah');
  });

  it('menandai proyek selesai yang tidak punya bukti apa pun', () => {
    const assessment = evaluateProject(
      facts({ deadline: null, reported_status: 'COMPLETED', target: 1, target_unit: 'system', reported_actual: 1 }, []),
    );
    expect(assessment.findings.map((f) => f.detector)).toContain('closure_evidence_missing');
  });
});
