import type { Portfolio } from '../interpret/types.js';

const SEVERITY_RANK: Record<string, number> = { info: 0, watch: 1, attention: 2, critical: 3 };

export interface FindingKey {
  project_id: string;
  fingerprint: string;
  detector: string;
  severity: string;
}

export interface FindingDiff {
  opened: FindingKey[];
  gone: FindingKey[];
  escalated: Array<FindingKey & { from: string }>;
  deescalated: Array<FindingKey & { from: string }>;
}

function flatten(portfolio: Portfolio | null): Map<string, FindingKey> {
  const out = new Map<string, FindingKey>();
  if (!portfolio) return out;
  for (const project of portfolio.projects) {
    for (const finding of project.findings) {
      if (finding.severity_final === 'info') continue;
      out.set(`${project.project_id}|${finding.fingerprint}`, {
        project_id: project.project_id,
        fingerprint: finding.fingerprint,
        detector: finding.detector,
        severity: finding.severity_final,
      });
    }
  }
  return out;
}

/**
 * Apa yang berubah di daftar temuan setelah impor. Tanpa ini, laporan impor hanya
 * bilang berapa baris masuk, bukan temuan mana yang lahir atau hilang.
 */
export function diffFindings(before: Portfolio | null, after: Portfolio): FindingDiff {
  const prev = flatten(before);
  const next = flatten(after);
  const opened: FindingKey[] = [];
  const gone: FindingKey[] = [];
  const escalated: Array<FindingKey & { from: string }> = [];
  const deescalated: Array<FindingKey & { from: string }> = [];

  for (const [key, finding] of next) {
    const old = prev.get(key);
    if (!old) {
      opened.push(finding);
      continue;
    }
    const delta = SEVERITY_RANK[finding.severity]! - SEVERITY_RANK[old.severity]!;
    if (delta > 0) escalated.push({ ...finding, from: old.severity });
    if (delta < 0) deescalated.push({ ...finding, from: old.severity });
  }
  for (const [key, finding] of prev) {
    if (!next.has(key)) gone.push(finding);
  }

  return { opened, gone, escalated, deescalated };
}
