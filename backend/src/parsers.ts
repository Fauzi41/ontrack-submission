import { parse } from 'csv-parse/sync';
import type {
  IngestionWarning,
  ProductionEvidenceRecord,
  ProjectMasterRecord,
  ProjectUpdateRecord,
} from './types.js';

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed);
}

export function isValidIsoDateTime(value: string): boolean {
  if (!ISO_DATETIME_RE.test(value) && !ISO_DATE_RE.test(value)) return false;
  const parsed = Date.parse(value);
  return !Number.isNaN(parsed);
}

export function parseProjectMasterCsv(
  csvContent: string,
  sourceFile = '02_Project_Master.csv'
): { records: ProjectMasterRecord[]; warnings: IngestionWarning[] } {
  const warnings: IngestionWarning[] = [];
  const records: ProjectMasterRecord[] = [];

  if (!csvContent || !csvContent.trim()) {
    warnings.push({
      source_file: sourceFile,
      record_ref: 'FILE',
      severity: 'ERROR',
      code: 'EMPTY_CSV',
      message: 'Project Master CSV is empty.',
    });
    return { records, warnings };
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    warnings.push({
      source_file: sourceFile,
      record_ref: 'FILE',
      severity: 'ERROR',
      code: 'CSV_PARSE_ERROR',
      message: `Malformed CSV: ${(err as Error).message}`,
    });
    return { records, warnings };
  }

  rows.forEach((row, index) => {
    const rowRef = row.project_id ? `${row.project_id} (row ${index + 2})` : `row ${index + 2}`;
    const requiredText = [
      'project_id',
      'customer',
      'project_name',
      'project_type',
      'pic',
      'start_date',
      'deadline',
      'target_unit',
      'reported_status',
      'last_reported_update_at',
    ] as const;

    const missingFields = requiredText.filter((field) => !row[field] || !String(row[field]).trim());
    if (missingFields.length > 0) {
      warnings.push({
        source_file: sourceFile,
        record_ref: rowRef,
        field: missingFields.join(', '),
        severity: 'ERROR',
        code: 'MISSING_REQUIRED_FIELD',
        message: `Row quarantined due to missing required fields: ${missingFields.join(', ')}.`,
      });
      return;
    }

    if (!isValidIsoDate(row.start_date) || !isValidIsoDate(row.deadline)) {
      warnings.push({
        source_file: sourceFile,
        record_ref: rowRef,
        field: 'start_date/deadline',
        severity: 'ERROR',
        code: 'INVALID_DATE_FORMAT',
        message: `Invalid date format (expected YYYY-MM-DD): start_date=${row.start_date}, deadline=${row.deadline}.`,
      });
      return;
    }

    if (Date.parse(`${row.deadline}T00:00:00Z`) < Date.parse(`${row.start_date}T00:00:00Z`)) {
      warnings.push({
        source_file: sourceFile,
        record_ref: rowRef,
        field: 'deadline',
        severity: 'ERROR',
        code: 'DEADLINE_BEFORE_START',
        message: `Deadline (${row.deadline}) is earlier than start_date (${row.start_date}). Row quarantined to prevent invalid schedule calculation.`,
      });
      return;
    }

    if (!isValidIsoDateTime(row.last_reported_update_at)) {
      warnings.push({
        source_file: sourceFile,
        record_ref: rowRef,
        field: 'last_reported_update_at',
        severity: 'ERROR',
        code: 'INVALID_TIMESTAMP',
        message: `Invalid last_reported_update_at timestamp: ${row.last_reported_update_at}.`,
      });
      return;
    }

    const target = Number(row.target);
    const reportedActual = Number(row.reported_actual);
    const reportedProgressPct = Number(row.reported_progress_pct);

    if (
      !Number.isFinite(target) ||
      target <= 0 ||
      !Number.isFinite(reportedActual) ||
      reportedActual < 0 ||
      !Number.isFinite(reportedProgressPct) ||
      reportedProgressPct < 0
    ) {
      warnings.push({
        source_file: sourceFile,
        record_ref: rowRef,
        field: 'target/reported_actual/reported_progress_pct',
        severity: 'ERROR',
        code: 'INVALID_NUMERIC_VALUE',
        message: `Invalid numeric metric (target=${row.target}, reported_actual=${row.reported_actual}, reported_progress_pct=${row.reported_progress_pct}). Row quarantined instead of defaulting to zero.`,
      });
      return;
    }

    records.push({
      project_id: row.project_id.trim(),
      customer: row.customer.trim(),
      project_name: row.project_name.trim(),
      project_type: row.project_type.trim(),
      pic: row.pic.trim(),
      start_date: row.start_date.trim(),
      deadline: row.deadline.trim(),
      target,
      target_unit: row.target_unit.trim(),
      reported_actual: reportedActual,
      reported_progress_pct: reportedProgressPct,
      reported_status: row.reported_status.trim().toUpperCase(),
      last_reported_update_at: row.last_reported_update_at.trim(),
    });
  });

  return { records, warnings };
}

export function parseProjectUpdatesCsv(
  csvContent: string,
  sourceFile = '03_Project_Updates.csv'
): { records: ProjectUpdateRecord[]; warnings: IngestionWarning[] } {
  const warnings: IngestionWarning[] = [];
  const records: ProjectUpdateRecord[] = [];

  if (!csvContent || !csvContent.trim()) {
    warnings.push({
      source_file: sourceFile,
      record_ref: 'FILE',
      severity: 'WARNING',
      code: 'EMPTY_CSV',
      message: 'Project Updates CSV is empty.',
    });
    return { records, warnings };
  }

  let rows: Record<string, string>[];
  try {
    rows = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    });
  } catch (err) {
    warnings.push({
      source_file: sourceFile,
      record_ref: 'FILE',
      severity: 'ERROR',
      code: 'CSV_PARSE_ERROR',
      message: `Malformed CSV: ${(err as Error).message}`,
    });
    return { records, warnings };
  }

  rows.forEach((row, index) => {
    const rowRef = row.update_id ? `${row.update_id} (row ${index + 2})` : `row ${index + 2}`;
    const required = ['update_id', 'project_id', 'timestamp', 'source_type', 'source_name', 'message'] as const;
    const missing = required.filter((field) => !row[field] || !String(row[field]).trim());

    if (missing.length > 0) {
      warnings.push({
        source_file: sourceFile,
        record_ref: rowRef,
        field: missing.join(', '),
        severity: 'ERROR',
        code: 'MISSING_REQUIRED_FIELD',
        message: `Update row quarantined due to missing fields: ${missing.join(', ')}.`,
      });
      return;
    }

    if (!isValidIsoDateTime(row.timestamp)) {
      warnings.push({
        source_file: sourceFile,
        record_ref: rowRef,
        field: 'timestamp',
        severity: 'ERROR',
        code: 'INVALID_TIMESTAMP',
        message: `Invalid update timestamp: ${row.timestamp}. Row quarantined.`,
      });
      return;
    }

    records.push({
      update_id: row.update_id.trim(),
      project_id: row.project_id.trim(),
      timestamp: row.timestamp.trim(),
      source_type: row.source_type.trim().toUpperCase(),
      source_name: row.source_name.trim(),
      message: row.message.trim(),
    });
  });

  return { records, warnings };
}

export function parseProductionDataJson(
  jsonContent: string,
  sourceFile = '04_Production_Data.json'
): {
  generated_at: string | null;
  records: ProductionEvidenceRecord[];
  warnings: IngestionWarning[];
} {
  const warnings: IngestionWarning[] = [];
  const records: ProductionEvidenceRecord[] = [];

  if (!jsonContent || !jsonContent.trim()) {
    warnings.push({
      source_file: sourceFile,
      record_ref: 'FILE',
      severity: 'ERROR',
      code: 'EMPTY_JSON',
      message: 'Production Data JSON is empty.',
    });
    return { generated_at: null, records, warnings };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonContent);
  } catch (err) {
    warnings.push({
      source_file: sourceFile,
      record_ref: 'FILE',
      severity: 'ERROR',
      code: 'JSON_PARSE_ERROR',
      message: `Malformed JSON: ${(err as Error).message}`,
    });
    return { generated_at: null, records, warnings };
  }

  let rawRecords: unknown[] = [];
  let generatedAt: string | null = null;

  if (Array.isArray(parsed)) {
    rawRecords = parsed;
  } else if (parsed && typeof parsed === 'object') {
    const obj = parsed as Record<string, unknown>;
    if (typeof obj.generated_at === 'string' && isValidIsoDateTime(obj.generated_at)) {
      generatedAt = obj.generated_at;
    }
    if (Array.isArray(obj.records)) {
      rawRecords = obj.records;
    } else {
      warnings.push({
        source_file: sourceFile,
        record_ref: 'ROOT',
        field: 'records',
        severity: 'ERROR',
        code: 'MISSING_RECORDS_ARRAY',
        message: 'JSON root object must contain a "records" array.',
      });
      return { generated_at: generatedAt, records, warnings };
    }
  } else {
    warnings.push({
      source_file: sourceFile,
      record_ref: 'ROOT',
      severity: 'ERROR',
      code: 'INVALID_JSON_ROOT',
      message: 'JSON root must be an object with "records" or an array of records.',
    });
    return { generated_at: null, records, warnings };
  }

  rawRecords.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      warnings.push({
        source_file: sourceFile,
        record_ref: `records[${index}]`,
        severity: 'ERROR',
        code: 'INVALID_RECORD_OBJECT',
        message: `Record at index ${index} is not a JSON object. Quarantined.`,
      });
      return;
    }

    const rec = item as Record<string, unknown>;
    const ref =
      typeof rec.source_record_id === 'string' && rec.source_record_id.trim()
        ? rec.source_record_id.trim()
        : `records[${index}]`;

    const requiredKeys = [
      'source_record_id',
      'project_id',
      'source_system',
      'record_type',
      'timestamp',
    ] as const;
    const missing = requiredKeys.filter(
      (k) => typeof rec[k] !== 'string' || !(rec[k] as string).trim()
    );
    if (missing.length > 0) {
      warnings.push({
        source_file: sourceFile,
        record_ref: ref,
        field: missing.join(', '),
        severity: 'ERROR',
        code: 'MISSING_REQUIRED_FIELD',
        message: `Production record quarantined due to missing fields: ${missing.join(', ')}.`,
      });
      return;
    }

    const ts = (rec.timestamp as string).trim();
    if (!isValidIsoDateTime(ts)) {
      warnings.push({
        source_file: sourceFile,
        record_ref: ref,
        field: 'timestamp',
        severity: 'ERROR',
        code: 'INVALID_TIMESTAMP',
        message: `Invalid production record timestamp: ${ts}. Quarantined.`,
      });
      return;
    }

    // Validate numeric operational fields if present (never silently coerce NaN!)
    const numericCandidateFields = [
      'verified_quantity',
      'pending_internal_check_quantity',
      'pages_processed_total',
      'processed_boxes',
      'records_verified',
      'records_skipped_missing_region',
      'developed_endpoints',
      'configured_endpoints',
      'production_tested_endpoints',
      'target_endpoints',
      'active_users_last_24h',
      'successful_logins_last_24h',
      'failed_logins_last_24h',
    ];
    for (const numField of numericCandidateFields) {
      if (numField in rec && rec[numField] !== null && rec[numField] !== undefined) {
        if (typeof rec[numField] !== 'number' || !Number.isFinite(rec[numField])) {
          warnings.push({
            source_file: sourceFile,
            record_ref: ref,
            field: numField,
            severity: 'ERROR',
            code: 'INVALID_NUMERIC_VALUE',
            message: `Field "${numField}" has non-numeric value (${String(rec[numField])}). Record quarantined.`,
          });
          return;
        }
      }
    }

    records.push({
      source_record_id: (rec.source_record_id as string).trim(),
      project_id: (rec.project_id as string).trim(),
      source_system: (rec.source_system as string).trim(),
      record_type: (rec.record_type as string).trim(),
      timestamp: ts,
      raw_payload: rec,
    });
  });

  return { generated_at: generatedAt, records, warnings };
}
