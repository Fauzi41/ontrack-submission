import { describe, expect, it } from 'vitest';
import { inMemoryDb } from '../src/db/db.js';
import { runImport } from '../src/ingest/importer.js';
import { assemblePortfolio, adjust } from '../src/interpret/engine.js';
import { loadFacts, readAsOf } from '../src/interpret/load.js';
import type { Finding } from '../src/interpret/types.js';
import { DATA_DIR } from '../src/config.js';
import { facts, master, value } from './helpers.js';

function realPortfolio(): ReturnType<typeof assemblePortfolio> {
  const db = inMemoryDb();
  runImport(db, { dataDir: DATA_DIR });
  return assemblePortfolio(readAsOf(db), loadFacts(db));
}

describe('portofolio pada data asli', () => {
  const portfolio = realPortfolio();

  it('memberi urutan yang bisa dipertanggungjawabkan', () => {
    expect(portfolio.projects.map((p) => p.project_id)).toEqual([
      'PRJ-002',
      'PRJ-005',
      'PRJ-004',
      'PRJ-001',
      'PRJ-003',
      'PRJ-006',
    ]);
  });

  it('menghitung severity tiap proyek', () => {
    const byId = new Map(portfolio.projects.map((p) => [p.project_id, p.top_severity]));
    expect(byId.get('PRJ-002')).toBe('critical');
    expect(byId.get('PRJ-005')).toBe('critical');
    expect(byId.get('PRJ-004')).toBe('critical');
    expect(byId.get('PRJ-001')).toBe('attention');
    expect(byId.get('PRJ-003')).toBe('watch');
    expect(byId.get('PRJ-006')).toBe('info');
    expect(portfolio.counts).toEqual({ critical: 3, attention: 1, watch: 1, info: 1 });
  });

  it('menggabungkan temuan PRJ-002 yang berbagi bukti, bukan mengulangnya', () => {
    const prj = portfolio.projects.find((p) => p.project_id === 'PRJ-002')!;
    expect(prj.findings.length).toBeGreaterThanOrEqual(3);
    expect(prj.groups).toHaveLength(1);
    const members = prj.groups[0]?.member_fingerprints ?? [];
    expect(members).toContain('schedule_risk:main');
    expect(members).toContain('progress_gap:main');
  });

  it('menyimpan tanda borderline pada PRJ-001', () => {
    const prj = portfolio.projects.find((p) => p.project_id === 'PRJ-001')!;
    expect(prj.findings.some((f) => f.borderline)).toBe(true);
  });

  it('tidak menghitung laju untuk pekerjaan diskrit', () => {
    const prj = portfolio.projects.find((p) => p.project_id === 'PRJ-005')!;
    expect(prj.findings.some((f) => f.detector === 'schedule_risk')).toBe(false);
    expect(prj.findings.some((f) => f.detector === 'progress_basis_conflict')).toBe(true);
    expect(prj.notes.join(' ')).toContain('diskrit');
  });

  it('tidak pernah membiarkan temuan berkunci rendah menjadi kritis', () => {
    for (const p of portfolio.projects) {
      for (const f of p.findings) {
        expect(f.severity_final === 'critical' && f.confidence === 'low').toBe(false);
      }
    }
  });

  it('tidak memberi peringkat pada proyek yang hanya berisi info', () => {
    const prj = portfolio.projects.find((p) => p.project_id === 'PRJ-006')!;
    expect(prj.rank).toBeNull();
  });
});

describe('aturan peringkat', () => {
  const criticalFacts = (id: string, deadline: string | null) =>
    facts({ project_id: id, target: 1000, target_unit: 'ML', reported_actual: 900, deadline }, [
      master('reported_actual', 900),
      value('verified_quantity', 800, { unit: 'ML', source_ref_id: `VER-${id}` }),
    ]);

  it('memberi peringkat sama untuk data yang benar-benar seri, di semua anggotanya', () => {
    const portfolio = assemblePortfolio('2026-10-06T17:00:00', [
      criticalFacts('PRJ-A', '2026-10-15'),
      criticalFacts('PRJ-B', '2026-10-15'),
    ]);
    expect(portfolio.projects.map((p) => p.rank)).toEqual([1, 1]);
    expect(portfolio.projects.every((p) => p.tied)).toBe(true);
  });

  it('menaruh tekanan waktu yang tidak diketahui di bawah yang diketahui', () => {
    const portfolio = assemblePortfolio('2026-10-06T17:00:00', [
      criticalFacts('PRJ-NO-DEADLINE', null),
      criticalFacts('PRJ-FAR', '2026-12-01'),
    ]);
    expect(portfolio.projects[0]?.project_id).toBe('PRJ-FAR');
    expect(portfolio.projects[1]?.time_pressure).toBe('UNKNOWN');
  });
});

describe('penyesuaian severity oleh keyakinan', () => {
  const base: Finding = {
    project_id: 'PRJ-T',
    detector: 'uji',
    fingerprint: 'uji:main',
    severity: 'critical',
    severity_final: 'critical',
    confidence: 'low',
    method: '-',
    reason: '-',
    unknowns: [],
    evidence: [],
    action: '-',
    owner: 'PROJECT_MANAGER',
    owner_reason: '-',
    borderline: false,
    time_pressure: 'UNKNOWN',
    group_key: null,
  };

  it('menurunkan kritis berkunci rendah ke perhatian', () => {
    expect(adjust(base).severity_final).toBe('attention');
  });

  it('membiarkan kritis berkunci tinggi', () => {
    expect(adjust({ ...base, confidence: 'high' }).severity_final).toBe('critical');
  });
});
