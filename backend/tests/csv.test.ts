import { describe, expect, it } from 'vitest';
import { parseCsv, toObjects } from '../src/ingest/csv.js';

describe('parseCsv', () => {
  it('membuang BOM dan menangani CRLF', () => {
    const r = parseCsv('\uFEFFa,b\r\n1,2\r\n');
    expect(r.header).toEqual(['a', 'b']);
    expect(r.rows).toEqual([['1', '2']]);
    expect(r.malformed).toEqual([]);
  });

  it('menjaga koma dan newline di dalam kutip', () => {
    const r = parseCsv('id,pesan\n1,"halo, dunia"\n2,"baris satu\nbaris dua"');
    expect(r.rows).toEqual([
      ['1', 'halo, dunia'],
      ['2', 'baris satu\nbaris dua'],
    ]);
  });

  it('membaca kutip ganda sebagai satu tanda kutip', () => {
    const r = parseCsv('id,pesan\n1,"dia bilang ""ok"""');
    expect(r.rows[0]?.[1]).toBe('dia bilang "ok"');
  });

  it('menolak baris dengan jumlah kolom berbeda dan menyebut nomor baris aslinya', () => {
    const r = parseCsv('a,b,c\n1,2,3\n4,5\n6,7,8');
    expect(r.malformed).toHaveLength(1);
    expect(r.malformed[0]?.line).toBe(3);
    expect(r.malformed[0]?.code).toBe('COLUMN_COUNT_MISMATCH');
    expect(r.rows).toEqual([
      ['1', '2', '3'],
      ['6', '7', '8'],
    ]);
  });

  it('melewatkan baris kosong tanpa menggeser nomor baris', () => {
    const r = parseCsv('a,b\n\n1,2\n\n3,4,5\n');
    expect(r.rows).toEqual([['1', '2']]);
    expect(r.malformed[0]?.line).toBe(5);
  });

  it('memetakan baris ke objek memakai header', () => {
    const r = parseCsv('id,nilai\n7,abc\n');
    expect(toObjects(r.header, r.rows)).toEqual([{ id: '7', nilai: 'abc' }]);
  });

  it('tidak menggantung saat kutip terakhir tidak ditutup', () => {
    const r = parseCsv('a,b\n1,"abc');
    expect(r.rows).toEqual([['1', 'abc']]);
    expect(r.malformed).toEqual([]);
  });
});
