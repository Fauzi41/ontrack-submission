/**
 * Parser CSV minimal tapi benar: BOM, CRLF, field ber-kutip, kutip ganda,
 * dan newline di dalam kutip. Tidak memakai dependensi agar importer tetap
 * transparan saat ditelusuri di Q&A.
 */
export interface CsvParseResult {
  header: string[];
  rows: string[][];
  malformed: Array<{ line: number; code: string; message: string }>;
}

export function parseCsv(text: string): CsvParseResult {
  const clean = text.replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  let line = 1;
  let rowStartLine = 1;

  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;

    if (inQuotes) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\r') {
      // abaikan; \n yang menutup baris
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      line++;
      rowStartLine = line;
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  const nonEmpty = rows.filter((r) => r.some((c) => c.trim() !== ''));
  const header = (nonEmpty.shift() ?? []).map((h) => h.trim());

  const malformed: CsvParseResult['malformed'] = [];
  const out: string[][] = [];
  nonEmpty.forEach((r, idx) => {
    if (r.length !== header.length) {
      malformed.push({
        line: idx + 2,
        code: 'COLUMN_COUNT_MISMATCH',
        message: `baris punya ${r.length} kolom, header ${header.length}`,
      });
      return;
    }
    out.push(r);
  });

  return { header, rows: out, malformed };
}

export function toObjects(header: string[], rows: string[][]): Array<Record<string, string>> {
  return rows.map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => {
      obj[h] = (r[i] ?? '').trim();
    });
    return obj;
  });
}
