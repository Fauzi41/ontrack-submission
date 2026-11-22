import { openDb } from '../db/db.js';
import { assemblePortfolio } from '../interpret/engine.js';
import { loadFacts, readAsOf } from '../interpret/load.js';
import { fmt } from '../interpret/context.js';
import { SEVERITY_ORDER } from '../interpret/types.js';

const db = openDb();
const asOf = readAsOf(db);
const portfolio = assemblePortfolio(asOf, loadFacts(db, asOf));

const pad = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

console.log(`\nPORTOFOLIO  as_of ${portfolio.as_of}\n`);
console.log(`${pad('#', 3)} ${pad('proyek', 9)} ${pad('severity', 11)} ${pad('waktu', 13)} ${pad('sisa', 6)} temuan`);
console.log('-'.repeat(78));
for (const p of portfolio.projects) {
  const rank = p.rank === null ? '-' : `${p.rank}${p.tied ? '=' : ' '}`;
  const left = p.time_pressure === 'NONE' || p.days_remaining === null ? '?' : fmt(p.days_remaining);
  console.log(
    `${pad(rank, 3)} ${pad(p.project_id, 9)} ${pad(p.top_severity, 11)} ${pad(p.time_pressure, 13)} ${pad(left, 6)} ${p.findings.filter((f) => f.severity_final !== 'info').length}`,
  );
}

for (const p of portfolio.projects) {
  if (p.findings.length === 0) continue;
  console.log(`\n\n${'='.repeat(78)}\n${p.project_id}  ${p.project_name}  [${p.project_type}]`);
  console.log(`${p.customer} · PIC ${p.pic ?? '-'} · status ${p.lifecycle} · ${p.time_pressure}`);
  console.log(`progress: ${fmt(p.progress.reported)}/${fmt(p.progress.target)} ${p.progress.unit ?? ''} dilaporkan ${fmt(p.progress.pct_reported)}% · hitung ${fmt(p.progress.pct_calculated)}% · basis ${p.progress.basis}`);
  for (const note of p.notes) console.log(`catatan: ${note}`);
  if (p.groups.length > 0) {
    for (const g of p.groups) console.log(`kelompok [${g.severity}] ${g.title} <- ${g.member_fingerprints.join(', ')}`);
  }

  const ordered = [...p.findings].sort((a, b) => SEVERITY_ORDER[b.severity_final] - SEVERITY_ORDER[a.severity_final]);
  for (const f of ordered) {
    const flags = [f.borderline ? 'borderline' : '', f.group_key ? 'terkelompok' : ''].filter(Boolean).join(', ');
    console.log(`\n  [${f.severity_final}${f.severity_final !== f.severity ? ` (dari ${f.severity})` : ''}] ${f.detector} · keyakinan ${f.confidence}${flags ? ` · ${flags}` : ''}`);
    console.log(`  alasan   : ${f.reason}`);
    console.log(`  metode   : ${f.method}`);
    console.log(`  bukti    : ${f.evidence.map((e) => `${e.ref_id} (${e.source_kind}/${e.provenance} ${e.observed_at ?? '-'})`).join(' | ')}`);
    for (const u of f.unknowns) console.log(`  belum tau: ${u}`);
    console.log(`  tindakan : ${f.action}`);
    console.log(`  pemilik  : ${f.owner} (saran sistem, bukan penugasan) - ${f.owner_reason}`);
  }
}

console.log(`\n\nRINGKASAN  kritis ${portfolio.counts.critical} · perhatian ${portfolio.counts.attention} · pantau ${portfolio.counts.watch} · info ${portfolio.counts.info}\n`);
