import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { DEFAULT_AS_OF_DATE, OnTrackDatabase } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const PORT = Number(process.env.PORT ?? 4000);
const DATA_DIR = process.env.DATA_DIR ?? path.join(projectRoot, 'data');
const DB_PATH = process.env.DB_PATH ?? path.join(projectRoot, 'data', 'ontrack.sqlite');

const db = new OnTrackDatabase(DB_PATH);
const startupRun = db.ingestFromDirectory(DATA_DIR, 'STARTUP');

const app = createApp({ db, dataDir: DATA_DIR });

app.listen(PORT, () => {
  console.log(`[OnTrack API] Running at http://localhost:${PORT}`);
  console.log(`[OnTrack API] SQLite DB: ${DB_PATH}`);
  console.log(`[OnTrack API] Source Data Dir: ${DATA_DIR}`);
  console.log(`[OnTrack API] Default As-Of Date: ${DEFAULT_AS_OF_DATE}`);
  console.log(
    `[OnTrack API] Startup ingestion: masters=${startupRun.masters_upserted}, updates=${startupRun.updates_inserted} (dup=${startupRun.updates_duplicate_skipped}), prod=${startupRun.production_inserted} (dup=${startupRun.production_duplicate_skipped}), warnings=${startupRun.warnings.length}`
  );
});
