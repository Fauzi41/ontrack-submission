import { describe, expect, it } from 'vitest';
import { parseNumber, presenceOf } from '../src/core/presence.js';

describe('presenceOf', () => {
  it('membedakan null di JSON dari sel kosong di CSV', () => {
    expect(presenceOf(null)).toBe('KNOWN_ABSENT');
    expect(presenceOf(undefined)).toBe('NOT_PROVIDED');
    expect(presenceOf('')).toBe('NOT_PROVIDED');
    expect(presenceOf('   ')).toBe('NOT_PROVIDED');
  });

  it('membaca nol sebagai nilai yang ada', () => {
    expect(presenceOf(0)).toBe('PRESENT');
    expect(presenceOf('0')).toBe('PRESENT');
  });
});

describe('parseNumber', () => {
  it('menerima koma desimal dan titik ribuan', () => {
    expect(parseNumber('79,5').value).toBe(79.5);
    expect(parseNumber('1.234,5').value).toBe(1234.5);
    expect(parseNumber(' 318 ').value).toBe(318);
    expect(parseNumber(0).value).toBe(0);
  });

  it('menolak nilai tak terbaca dengan issue, bukan NaN', () => {
    const parsed = parseNumber('sekitar seratus');
    expect(parsed.value).toBeNull();
    expect(parsed.presence).toBe('PRESENT');
    expect(parsed.issue).toContain('tidak dapat dibaca');
    expect(Number.isNaN(parsed.value as number)).toBe(false);
  });

  it('meneruskan keadaan kosong tanpa mengarang nilai', () => {
    expect(parseNumber(null)).toEqual({ value: null, presence: 'KNOWN_ABSENT' });
    expect(parseNumber('')).toEqual({ value: null, presence: 'NOT_PROVIDED' });
  });
});
