import { openDb } from '../db/db';
import { ImportError, runImport } from '../ingest/importer';

const db = openDb();
try {
  const report = runImport(db);
  const { issues, inventory, ...counters } = report;

  console.log('\nIMPORT REPORT');
  console.log('─'.repeat(64));
  for (const [k, v] of Object.entries({ ...counters, ...inventory })) {
    console.log(`  ${k.padEnd(20)} ${v}`);
  }
  console.log('─'.repeat(64));
  console.log(`  issues                ${issues.length}`);
  for (const i of issues.slice(0, 20)) {
    console.log(`   [${i.severity}] ${i.code} — ${i.message}`);
  }
  if (issues.length > 20) console.log(`   ... ${issues.length - 20} lainnya`);

  const rows = db
    .prepare(
      `SELECT p.project_id, p.project_type, p.reported_actual, p.target, p.target_unit, p.reported_progress_pct,
              (SELECT COUNT(*) FROM source_records r WHERE r.project_id = p.project_id AND r.source_kind='UPDATE') AS upd,
              (SELECT COUNT(*) FROM source_records r WHERE r.project_id = p.project_id AND r.source_kind='PRODUCTION') AS prod
         FROM projects p ORDER BY p.project_id`,
    )
    .all() as Array<Record<string, unknown>>;
  console.log('\nPROYEK');
  console.log('  id       type                    actual/target      pct   upd  prod');
  for (const r of rows) {
    console.log(
      `  ${String(r.project_id).padEnd(8)} ${String(r.project_type).slice(0, 23).padEnd(23)} ` +
        `${String(r.reported_actual).padStart(7)}/${String(r.target).padEnd(8)} ${String(r.reported_progress_pct).padStart(6)} ` +
        `${String(r.upd).padStart(4)} ${String(r.prod).padStart(5)}`,
    );
  }
  console.log();
} catch (err) {
  if (err instanceof ImportError) {
    console.error(`IMPORT GAGAL [${err.code}]: ${err.message}`);
    process.exitCode = 1;
  } else {
    throw err;
  }
}
