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
  const rowLines: number[] = [];
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
      rowLines.push(rowStartLine);
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
    rowLines.push(rowStartLine);
  }

  // Nomor baris ikut dibawa supaya baris yang ditolak bisa dilacak ke file aslinya,
  // bukan ke posisinya setelah baris lain dibuang.
  const pairs = rows
    .map((cells, i) => ({ cells, line: rowLines[i] ?? i + 1 }))
    .filter((r) => r.cells.some((c) => c.trim() !== ''));
  const header = (pairs.shift()?.cells ?? []).map((h) => h.trim());

  const malformed: CsvParseResult['malformed'] = [];
  const out: string[][] = [];
  for (const p of pairs) {
    if (p.cells.length !== header.length) {
      malformed.push({
        line: p.line,
        code: 'COLUMN_COUNT_MISMATCH',
        message: `baris punya ${p.cells.length} kolom, header ${header.length}`,
      });
      continue;
    }
    out.push(p.cells);
  }

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
