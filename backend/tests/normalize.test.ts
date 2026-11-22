import { describe, expect, it } from 'vitest';
import {
  normalizeMasterRow,
  normalizeProductionRecord,
  normalizeUpdateRow,
} from '../src/ingest/normalize.js';

const at = '2026-10-06T17:00:00Z';

describe('normalizeMasterRow', () => {
  it('menolak baris tanpa project_id', () => {
    const n = normalizeMasterRow({ customer: 'X' }, at);
    expect(n.ok).toBe(false);
    expect(n.issues[0]?.code).toBe('MISSING_PROJECT_ID');
  });

  it('melaporkan format tanggal yang salah tapi tetap menerima barisnya', () => {
    const n = normalizeMasterRow(
      { project_id: 'PRJ-X', target: '10', deadline: '15/10/2026', reported_actual: '1' },
      at,
    );
    expect(n.ok).toBe(true);
    expect(n.issues.map((i) => i.code)).toContain('BAD_DATE_FORMAT');
  });

  it('memisahkan null JSON dari sel kosong pada nilai', () => {
    const n = normalizeMasterRow({ project_id: 'PRJ-X', target: '10', reported_actual: '' }, at);
    const values = n.normalized?.values ?? [];
    const actual = values.find((v) => v.metric === 'reported_actual');
    expect(actual?.presence).toBe('NOT_PROVIDED');
  });
});

describe('normalizeUpdateRow', () => {
  it('menolak update tanpa kunci', () => {
    const n = normalizeUpdateRow({ project_id: 'PRJ-X' }, at);
    expect(n.ok).toBe(false);
    expect(n.issues[0]?.code).toBe('MISSING_KEY');
  });

  it('mencatat bentuk provenance REPORTED meski pengirimnya tim teknis', () => {
    const n = normalizeUpdateRow(
      { update_id: 'UPD-1', project_id: 'PRJ-X', timestamp: '2026-10-01T10:00:00', source_type: 'TECHNICAL_TEAM', message: 'selesai' },
      at,
    );
    expect(n.normalized?.record.provenance).toBe('REPORTED');
    expect(n.normalized?.record.source_kind).toBe('UPDATE');
  });
});

describe('normalizeProductionRecord', () => {
  it('menolak record tanpa identitas', () => {
    const n = normalizeProductionRecord({ metric_a: 1 }, at);
    expect(n.ok).toBe(false);
    expect(n.issues[0]?.code).toBe('MISSING_KEY');
  });

  it('tidak menjadikan kolom identitas sebagai nilai terukur', () => {
    const n = normalizeProductionRecord(
      {
        source_record_id: 'PROD-1',
        project_id: 'PRJ-X',
        timestamp: '2026-10-06T07:00:00',
        unit: 'ML',
        workflow_state: 'VERIFIED',
        verified_quantity: 301.5,
      },
      at,
    );
    const metrics = (n.normalized?.values ?? []).map((v) => v.metric);
    expect(metrics).toContain('verified_quantity');
    expect(metrics).not.toContain('source_record_id');
    expect(metrics).not.toContain('unit');
    expect(metrics).not.toContain('workflow_state');
  });

  it('menyimpan nilai bersarang sebagai teks, bukan membuangnya', () => {
    const n = normalizeProductionRecord(
      { source_record_id: 'PROD-2', project_id: 'PRJ-X', scanners: [{ status: 'RUNNING' }] },
      at,
    );
    const scanners = (n.normalized?.values ?? []).find((v) => v.metric === 'scanners');
    expect(scanners?.value_text).toContain('RUNNING');
  });
});
