import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

export const BACKEND_ROOT = path.resolve(here, '..');
export const REPO_ROOT = path.resolve(BACKEND_ROOT, '..');

/** Fixtures live beside the app so the repository is self-contained. */
export const DATA_DIR = process.env.ONTRACK_DATA_DIR ?? path.join(BACKEND_ROOT, 'data');
export const DB_PATH = process.env.ONTRACK_DB_PATH ?? path.join(BACKEND_ROOT, 'data', 'ontrack.db');

export const FIXTURES = {
  master: '02_Project_Master.csv',
  updates: '03_Project_Updates.csv',
  production: '04_Production_Data.json',
} as const;

export const API_PORT = Number(process.env.ONTRACK_PORT ?? 3001);

/**
 * Aturan tipe proyek — sengaja data, bukan if/else di kode, supaya tipe baru
 * bisa ditambahkan tanpa menyentuh logika (brief §12).
 */
export const PROJECT_TYPE_RULES: Array<{
  project_type: string;
  progress_basis: 'validated_quantity' | 'accepted_in_production';
  rate_model: 'flow' | 'discrete';
  expected_cadence_hours: number | null;
  note: string | null;
}> = [
  { project_type: 'Archive Arrangement', progress_basis: 'validated_quantity', rate_model: 'flow', expected_cadence_hours: 72, note: 'Dihitung dari kuantitas yang tervalidasi (ML).' },
  { project_type: 'Document Digitalisation', progress_basis: 'validated_quantity', rate_model: 'flow', expected_cadence_hours: 48, note: 'Dihitung dari halaman yang tercatat pada log scanner.' },
  { project_type: 'Data Verification', progress_basis: 'validated_quantity', rate_model: 'flow', expected_cadence_hours: 72, note: 'Dihitung dari record terverifikasi.' },
  { project_type: 'System Integration', progress_basis: 'accepted_in_production', rate_model: 'discrete', expected_cadence_hours: 72, note: 'Endpoint baru bernilai setelah diuji di production; proyeksi linear tidak sah.' },
  { project_type: 'DMS Implementation', progress_basis: 'accepted_in_production', rate_model: 'discrete', expected_cadence_hours: 168, note: 'Deliverable tunggal; progress berbasis penerimaan.' },
];

export const DEFAULT_TYPE_RULE = {
  progress_basis: 'validated_quantity' as const,
  rate_model: 'flow' as const,
  expected_cadence_hours: null,
  note: 'Basis progress belum dikonfigurasi untuk tipe ini; memakai default.',
};
