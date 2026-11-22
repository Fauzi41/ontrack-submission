/**
 * Tri-state — bukan nullable biasa.
 *
 * Data Dictionary membedakan dua bentuk "kosong":
 *   - JSON null   : field ADA, tidak ada nilai tercatat  -> KnownAbsent (bukti positif)
 *   - CSV kosong  : nilai tidak tersedia                -> NotProvided (benar-benar tidak diketahui)
 *
 * Menggabungkan keduanya menjadi "unknown" menurunkan justru kasus yang paling
 * terbukti — mis. PRJ-005 last_successful_connection = null berarti "tidak pernah
 * ada koneksi berhasil", bukan "tidak ada datanya".
 */
export type Presence = 'PRESENT' | 'KNOWN_ABSENT' | 'NOT_PROVIDED';

export function presenceOf(value: unknown): Presence {
  if (value === null) return 'KNOWN_ABSENT';
  if (value === undefined) return 'NOT_PROVIDED';
  if (typeof value === 'string' && value.trim() === '') return 'NOT_PROVIDED';
  return 'PRESENT';
}

export interface NumberParse {
  value: number | null;
  presence: Presence;
  issue?: string;
}

/**
 * Parser angka yang menolak diam-diam: nilai tidak sah menjadi issue, bukan NaN.
 * Menerima "79.5", "79,5" (koma desimal) dan "1.234,5" (ribuan + desimal).
 */
export function parseNumber(raw: unknown): NumberParse {
  const presence = presenceOf(raw);
  if (presence !== 'PRESENT') return { value: null, presence };

  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? { value: raw, presence } : { value: null, presence: 'PRESENT', issue: 'angka bukan finite' };
  }

  let text = String(raw).trim().replace(/\s/g, '');
  if (text.includes(',') && text.includes('.')) {
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (text.includes(',')) {
    text = text.replace(',', '.');
  }
  if (!/^[-+]?\d*\.?\d+$/.test(text)) {
    return { value: null, presence: 'PRESENT', issue: `angka tidak dapat dibaca: "${String(raw).slice(0, 40)}"` };
  }
  const value = Number(text);
  return Number.isFinite(value) ? { value, presence } : { value: null, presence: 'PRESENT', issue: 'angka bukan finite' };
}
