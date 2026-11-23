/**
 * Merangkum proof pack menjadi satu halaman yang bisa dibaca penguji.
 *
 * Semua angka diambil dari berkas hasil, bukan diketik ulang.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? 'proof';
const strip = (s) => s.replace(/\u001b\[[0-9;]*m/g, '');
const read = (name) => (existsSync(join(dir, name)) ? strip(readFileSync(join(dir, name), 'utf8')) : '');
const json = (name) => JSON.parse(read(join('json', name)) || '{}');

const portfolio = json('portfolio.json');
const issues = json('issues.json');
const inventory = json('source-inventory.json');
const tests = read('04-test.txt');
const verify = read('05-verifikasi.txt');
const coverage = read('06-cakupan.txt');
const build = read('07-build.txt');
const versions = read('08-versi.txt');
const env = read('00-lingkungan.txt');

const match = (text, re) => (text.match(re) ?? [])[1] ?? 'tidak terbaca';
const testLine = match(tests, /Tests\s+(\d+ passed[^\n]*)/);
const verifyLine = match(verify, /(\d+\/\d+) pemeriksaan lulus/);
const coverageLine = match(coverage, /All files\s+\|\s+([\d.]+)\s+\|\s+([\d.]+)/);
const bundle = match(build, /index-[\w-]+\.js\s+([\d.]+ kB)/);

const projects = (portfolio.projects ?? []).map((p) => ({
  id: p.project_id,
  name: p.project_name,
  severity: p.top_severity ?? '—',
  pctReported: p.progress?.pct_reported ?? '—',
  pctCalculated: p.progress?.pct_calculated ?? '—',
  findings: (p.findings ?? []).length,
  actionable: (p.findings ?? []).filter((f) => f.severity_final !== 'info').length,
}));

const byStatus = {};
for (const issue of issues.issues ?? []) byStatus[issue.status] = (byStatus[issue.status] ?? 0) + 1;

const kinds = (inventory.by_kind ?? []).map((k) => `${k.source_kind} ${k.count}`);
const totalRecords = (inventory.by_kind ?? []).reduce((sum, k) => sum + k.count, 0);
const severityCounts = Object.entries(portfolio.counts ?? {}).map(([k, v]) => `${k} ${v}`).join(', ');
const versionsOk = (versions.match(/^OK/gm) ?? []).length;
const versionsTotal = versionsOk + (versions.match(/^GAGAL/gm) ?? []).length;

const lines = [];
lines.push('# Proof pack');
lines.push('');
lines.push('Dibangun ulang dengan `bash scripts/proof.sh`. Setiap berkas di bawah dihasilkan');
lines.push('oleh perintah yang tertulis di kalimatnya, bukan diketik tangan.');
lines.push('');
lines.push('## Lingkungan');
lines.push('```');
lines.push(env.trim());
lines.push('```');
lines.push('');
lines.push('## Portofolio saat impor');
lines.push('');
lines.push('| Peringkat | Proyek | Severity | Laporan | Bukti | Temuan | Menuntut tindakan |');
lines.push('|---|---|---|---|---|---|---|');
projects.forEach((p, i) => {
  lines.push(
    `| ${i + 1} | ${p.id} ${p.name} | ${p.severity} | ${p.pctReported ?? '—'} | ${p.pctCalculated ?? '—'} | ${p.findings} | ${p.actionable} |`,
  );
});
lines.push('');
lines.push('## Isu');
lines.push('');
lines.push(`Total ${issues.issues?.length ?? 0} isu di ` + Object.entries(byStatus).map(([k, v]) => `${k} ${v}`).join(', ') + '.');
lines.push('');
lines.push('## Kelengkapan bukti');
lines.push('');
lines.push(`Saat laporan dibaca (as_of ${portfolio.as_of ?? '—'}): ${totalRecords} baris sumber, terdiri dari ${kinds.join(', ')}.`);
lines.push('');
lines.push('## Sebaran severity');
lines.push('');
lines.push(severityCounts || 'tidak terbaca');
lines.push('');
lines.push('## Gerbang mutu');
lines.push('');
lines.push(`- Test: ${testLine}`);
lines.push(`- Verifikasi rute: ${verifyLine}`);
lines.push(`- Riwayat versi record: ${versionsOk}/${versionsTotal} pemeriksaan`);
lines.push(`- Cakupan pernyataan: ${coverageLine === 'tidak terbaca' ? 'lihat 06-cakupan.txt' : coverageLine + '%'}`);
lines.push(`- Bundel frontend: ${bundle}`);
lines.push('');
lines.push('## Berkas');
lines.push('');
for (const name of [
  '00-lingkungan.txt',
  '01-impor.txt',
  '02-evaluasi.txt',
  '03-dump.txt',
  '04-test.txt',
  '05-verifikasi.txt',
  '06-cakupan.txt',
  '07-build.txt',
]) {
  lines.push(`- \`${name}\``);
}
lines.push('- `json/portfolio.json`, `json/issues.json`, `json/source-inventory.json`');

writeFileSync(join(dir, 'SUMMARY.md'), lines.join('\n') + '\n', 'utf8');
console.log(lines.join('\n'));
