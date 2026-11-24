import { describe, expect, it } from 'vitest';
import {
  isValidIsoDate,
  isValidIsoDateTime,
  parseProductionDataJson,
  parseProjectMasterCsv,
  parseProjectUpdatesCsv,
} from '../backend/src/parsers.js';

const MASTER_HEADER =
  'project_id,customer,project_name,project_type,pic,start_date,deadline,target,target_unit,reported_actual,reported_progress_pct,reported_status,last_reported_update_at';
const UPDATE_HEADER = 'update_id,project_id,timestamp,source_type,source_name,message';

describe('parsers.ts — Date/Time Validation & Resilient CSV/JSON Parsing (28 tests)', () => {
  // Date & DateTime helpers (6 tests)
  it('1. accepts valid YYYY-MM-DD date', () => {
    expect(isValidIsoDate('2026-10-06')).toBe(true);
  });

  it('2. rejects non-ISO date string', () => {
    expect(isValidIsoDate('06/10/2026')).toBe(false);
    expect(isValidIsoDate('2026-10-06T10:00:00')).toBe(false);
  });

  it('3. rejects impossible calendar month in ISO date', () => {
    expect(isValidIsoDate('2026-13-40')).toBe(false);
  });

  it('4. accepts ISO datetime without timezone', () => {
    expect(isValidIsoDateTime('2026-10-06T17:00:00')).toBe(true);
  });

  it('5. accepts ISO datetime with Z or offset', () => {
    expect(isValidIsoDateTime('2026-10-06T17:00:00Z')).toBe(true);
    expect(isValidIsoDateTime('2026-10-06T17:00:00+07:00')).toBe(true);
  });

  it('6. rejects invalid datetime strings', () => {
    expect(isValidIsoDateTime('not-a-timestamp')).toBe(false);
    expect(isValidIsoDateTime('2026/10/06 17:00')).toBe(false);
  });

  // Project Master CSV (9 tests)
  it('7. flags EMPTY_CSV when project master content is empty', () => {
    const res = parseProjectMasterCsv('   ');
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('EMPTY_CSV');
  });

  it('8. flags CSV_PARSE_ERROR on unclosed quote in master CSV', () => {
    const res = parseProjectMasterCsv(`${MASTER_HEADER}\nPRJ-1,"Unclosed`);
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('CSV_PARSE_ERROR');
  });

  it('9. parses valid master CSV row and uppercases reported_status', () => {
    const res = parseProjectMasterCsv(
      `${MASTER_HEADER}\nPRJ-101,Client A,Proj A,Archive,Raka,2026-09-01,2026-10-15,400,ML,200,50,on track,2026-10-06T10:00:00`
    );
    expect(res.warnings).toHaveLength(0);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].reported_status).toBe('ON TRACK');
  });

  it('10. quarantines master row with missing required fields', () => {
    const res = parseProjectMasterCsv(
      `${MASTER_HEADER}\nPRJ-101,,Proj A,Archive,Raka,2026-09-01,2026-10-15,400,ML,200,50,ON TRACK,2026-10-06T10:00:00`
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('MISSING_REQUIRED_FIELD');
  });

  it('11. quarantines master row with invalid start_date or deadline format', () => {
    const res = parseProjectMasterCsv(
      `${MASTER_HEADER}\nPRJ-101,Cust,Proj A,Archive,Raka,01-09-2026,2026-10-15,400,ML,200,50,ON TRACK,2026-10-06T10:00:00`
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('INVALID_DATE_FORMAT');
  });

  it('12. quarantines master row when deadline precedes start_date', () => {
    const res = parseProjectMasterCsv(
      `${MASTER_HEADER}\nPRJ-101,Cust,Proj A,Archive,Raka,2026-10-20,2026-10-15,400,ML,200,50,ON TRACK,2026-10-06T10:00:00`
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('DEADLINE_BEFORE_START');
  });

  it('13. quarantines master row with invalid last_reported_update_at', () => {
    const res = parseProjectMasterCsv(
      `${MASTER_HEADER}\nPRJ-101,Cust,Proj A,Archive,Raka,2026-09-01,2026-10-15,400,ML,200,50,ON TRACK,bad-ts`
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('INVALID_TIMESTAMP');
  });

  it('14. quarantines master row when target <= 0 or NaN instead of coercing to zero', () => {
    const res = parseProjectMasterCsv(
      `${MASTER_HEADER}\nPRJ-101,Cust,Proj A,Archive,Raka,2026-09-01,2026-10-15,0,ML,200,50,ON TRACK,2026-10-06T10:00:00\nPRJ-102,Cust,Proj B,Archive,Raka,2026-09-01,2026-10-15,400,ML,abc,50,ON TRACK,2026-10-06T10:00:00`
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings).toHaveLength(2);
    expect(res.warnings[0].code).toBe('INVALID_NUMERIC_VALUE');
    expect(res.warnings[1].code).toBe('INVALID_NUMERIC_VALUE');
  });

  it('15. isolates invalid rows while still ingesting valid rows in same CSV', () => {
    const res = parseProjectMasterCsv(
      `${MASTER_HEADER}\nPRJ-BAD,Cust,Bad,Archive,Raka,2026-09-01,2026-10-15,-5,ML,10,10,ON TRACK,2026-10-06T10:00:00\nPRJ-OK,Cust,Good,Archive,Raka,2026-09-01,2026-10-15,100,ML,50,50,ON TRACK,2026-10-06T10:00:00`
    );
    expect(res.records).toHaveLength(1);
    expect(res.records[0].project_id).toBe('PRJ-OK');
    expect(res.warnings).toHaveLength(1);
  });

  // Project Updates CSV (5 tests)
  it('16. flags EMPTY_CSV warning on empty updates CSV', () => {
    const res = parseProjectUpdatesCsv('');
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('EMPTY_CSV');
  });

  it('17. parses valid update row and normalizes source_type to uppercase', () => {
    const res = parseProjectUpdatesCsv(
      `${UPDATE_HEADER}\nUPD-900,PRJ-001,2026-10-06T09:00:00,operator,Op 1,"Pesan normal, dengan koma."`
    );
    expect(res.warnings).toHaveLength(0);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].source_type).toBe('OPERATOR');
    expect(res.records[0].message).toContain('dengan koma');
  });

  it('18. quarantines update row with missing message or project_id', () => {
    const res = parseProjectUpdatesCsv(
      `${UPDATE_HEADER}\nUPD-901,,2026-10-06T09:00:00,OPERATOR,Op 1,Hello`
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('MISSING_REQUIRED_FIELD');
  });

  it('19. quarantines update row with invalid timestamp', () => {
    const res = parseProjectUpdatesCsv(
      `${UPDATE_HEADER}\nUPD-902,PRJ-001,tomorrow,OPERATOR,Op 1,Hello`
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('INVALID_TIMESTAMP');
  });

  it('20. flags CSV_PARSE_ERROR on malformed updates CSV', () => {
    const res = parseProjectUpdatesCsv(`${UPDATE_HEADER}\nUPD-903,"unclosed`);
    expect(res.warnings[0].code).toBe('CSV_PARSE_ERROR');
  });

  // Production Data JSON (8 tests)
  it('21. flags EMPTY_JSON on empty string', () => {
    const res = parseProductionDataJson('');
    expect(res.warnings[0].code).toBe('EMPTY_JSON');
  });

  it('22. flags JSON_PARSE_ERROR on malformed JSON syntax', () => {
    const res = parseProductionDataJson('{ invalid }');
    expect(res.warnings[0].code).toBe('JSON_PARSE_ERROR');
  });

  it('23. flags MISSING_RECORDS_ARRAY when root object lacks records array', () => {
    const res = parseProductionDataJson(JSON.stringify({ generated_at: '2026-10-06T17:00:00' }));
    expect(res.warnings[0].code).toBe('MISSING_RECORDS_ARRAY');
  });

  it('24. flags INVALID_JSON_ROOT on primitive JSON root', () => {
    const res = parseProductionDataJson('12345');
    expect(res.warnings[0].code).toBe('INVALID_JSON_ROOT');
  });

  it('25. accepts root array of production records directly', () => {
    const res = parseProductionDataJson(
      JSON.stringify([
        {
          source_record_id: 'REC-ARR-1',
          project_id: 'PRJ-001',
          source_system: 'archive_production_report',
          record_type: 'production_snapshot',
          timestamp: '2026-10-06T10:00:00',
          verified_quantity: 120,
        },
      ])
    );
    expect(res.warnings).toHaveLength(0);
    expect(res.records).toHaveLength(1);
    expect(res.records[0].source_record_id).toBe('REC-ARR-1');
  });

  it('26. quarantines non-object entries and missing required keys in records array', () => {
    const res = parseProductionDataJson(
      JSON.stringify({
        records: ['not-an-object', { source_record_id: 'REC-MISS', project_id: 'PRJ-001' }],
      })
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('INVALID_RECORD_OBJECT');
    expect(res.warnings[1].code).toBe('MISSING_REQUIRED_FIELD');
  });

  it('27. quarantines production record with invalid timestamp', () => {
    const res = parseProductionDataJson(
      JSON.stringify({
        records: [
          {
            source_record_id: 'REC-TS',
            project_id: 'PRJ-001',
            source_system: 'sys',
            record_type: 'snap',
            timestamp: 'invalid',
          },
        ],
      })
    );
    expect(res.records).toHaveLength(0);
    expect(res.warnings[0].code).toBe('INVALID_TIMESTAMP');
  });

  it('28. quarantines production record with non-numeric metric while preserving valid null fields', () => {
    const res = parseProductionDataJson(
      JSON.stringify({
        generated_at: '2026-10-06T17:00:00',
        records: [
          {
            source_record_id: 'REC-BAD-NUM',
            project_id: 'PRJ-002',
            source_system: 'scanner_production_log',
            record_type: 'production_snapshot',
            timestamp: '2026-10-06T10:00:00',
            pages_processed_total: '87240',
          },
          {
            source_record_id: 'REC-OK-NULL',
            project_id: 'PRJ-005',
            source_system: 'api_monitor',
            record_type: 'environment_check',
            timestamp: '2026-10-06T10:00:00',
            environment: 'production',
            connection_status: 'NOT_CONFIGURED',
            last_successful_connection: null,
          },
        ],
      })
    );
    expect(res.generated_at).toBe('2026-10-06T17:00:00');
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0].code).toBe('INVALID_NUMERIC_VALUE');
    expect(res.records).toHaveLength(1);
    expect(res.records[0].source_record_id).toBe('REC-OK-NULL');
  });
});
