-- OnTrack Project Intelligence — schema v1
-- Satu migrasi untuk seluruh aplikasi. Tabel yang belum dipakai pada fase 2
-- (findings/issues/followups) sudah dibuat supaya tidak ada migrasi kedua.

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id              TEXT PRIMARY KEY,
  customer                TEXT,
  project_name            TEXT,
  project_type            TEXT,
  pic                     TEXT,
  start_date              TEXT,
  deadline                TEXT,
  target                  REAL,
  target_unit             TEXT,
  reported_actual         REAL,
  reported_progress_pct   REAL,
  reported_status         TEXT,
  last_reported_update_at TEXT,
  active                  INTEGER NOT NULL DEFAULT 1,
  first_seen_at           TEXT NOT NULL,
  last_ingested_at        TEXT NOT NULL
);

-- Aturan per tipe proyek: data, bukan if/else di kode.
CREATE TABLE IF NOT EXISTS project_types (
  project_type           TEXT PRIMARY KEY,
  progress_basis         TEXT NOT NULL,   -- validated_quantity | accepted_in_production
  rate_model             TEXT NOT NULL,   -- flow | discrete
  expected_cadence_hours INTEGER,
  note                   TEXT
);

-- Satu baris per baris sumber. Tidak boleh ada baris yang tak terjangkau UI.
CREATE TABLE IF NOT EXISTS source_records (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      TEXT NOT NULL,
  source_kind     TEXT NOT NULL CHECK (source_kind IN ('MASTER','UPDATE','PRODUCTION')),
  provenance      TEXT NOT NULL CHECK (provenance IN ('REPORTED','OPERATIONAL')),
  source_ref_id   TEXT NOT NULL,
  source_system   TEXT,
  source_name     TEXT,
  record_type     TEXT,
  observed_at     TEXT,
  ingested_at     TEXT NOT NULL,
  raw_json        TEXT NOT NULL,
  is_late_arrival INTEGER NOT NULL DEFAULT 0,
  superseded_by   TEXT,
  UNIQUE (source_kind, source_ref_id)
);

CREATE INDEX IF NOT EXISTS idx_src_project ON source_records (project_id, observed_at);

-- Nilai yang diekstrak dari sebuah record. Tri-state: PRESENT / KNOWN_ABSENT / NOT_PROVIDED
CREATE TABLE IF NOT EXISTS observation_values (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id      INTEGER NOT NULL REFERENCES source_records(id) ON DELETE CASCADE,
  project_id     TEXT NOT NULL,
  metric         TEXT NOT NULL,
  unit           TEXT,
  value_num      REAL,
  value_text     TEXT,
  presence       TEXT NOT NULL CHECK (presence IN ('PRESENT','KNOWN_ABSENT','NOT_PROVIDED')),
  workflow_state TEXT,
  observed_at    TEXT,
  ingested_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_val_metric ON observation_values (project_id, metric, observed_at);

CREATE TABLE IF NOT EXISTS import_runs (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at   TEXT NOT NULL,
  finished_at  TEXT NOT NULL,
  as_of        TEXT,
  inserted     INTEGER NOT NULL DEFAULT 0,
  updated      INTEGER NOT NULL DEFAULT 0,
  duplicates   INTEGER NOT NULL DEFAULT 0,
  rejected     INTEGER NOT NULL DEFAULT 0,
  late_arrivals INTEGER NOT NULL DEFAULT 0,
  orphans      INTEGER NOT NULL DEFAULT 0,
  report_json  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_issues (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id       INTEGER NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
  severity     TEXT NOT NULL,   -- ERROR | WARN | INFO
  code         TEXT NOT NULL,
  project_id   TEXT,
  source_ref_id TEXT,
  message      TEXT NOT NULL
);

-- ---- Fase 3+ (skema sudah siap, belum ditulis kodenya) ----

CREATE TABLE IF NOT EXISTS findings (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id      TEXT NOT NULL,
  detector_key    TEXT NOT NULL,
  fingerprint     TEXT NOT NULL,
  group_key       TEXT,
  severity        TEXT NOT NULL,   -- critical | attention | watch | info
  severity_final  TEXT NOT NULL,   -- setelah penyesuaian confidence
  confidence      TEXT NOT NULL,   -- high | medium | low
  method          TEXT,            -- projection | required_pace | rule
  reason          TEXT NOT NULL,
  unknowns_json   TEXT NOT NULL DEFAULT '[]',
  evidence_json   TEXT NOT NULL DEFAULT '[]',
  recommended_action TEXT,
  suggested_owner_role TEXT,
  suggestion_rationale TEXT,
  computed_at     TEXT NOT NULL,
  as_of           TEXT NOT NULL,
  UNIQUE (project_id, fingerprint, as_of)
);

CREATE TABLE IF NOT EXISTS issues (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id     TEXT NOT NULL,
  detector_key   TEXT NOT NULL,
  fingerprint    TEXT NOT NULL,
  status         TEXT NOT NULL,   -- OPEN | AWAITING_EVIDENCE | VERIFIED_RESOLVED | NOT_DETECTED
  opened_at      TEXT NOT NULL,
  last_evaluated_at TEXT NOT NULL,
  resolved_by_record TEXT,
  reopen_count   INTEGER NOT NULL DEFAULT 0,
  detector_version TEXT NOT NULL DEFAULT 'v1',
  UNIQUE (project_id, fingerprint)
);

CREATE TABLE IF NOT EXISTS finding_responses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id    TEXT NOT NULL,
  fingerprint   TEXT NOT NULL,
  actor         TEXT NOT NULL,
  kind          TEXT NOT NULL,   -- ACKNOWLEDGED | DISPUTED | EXPLAINED
  note          TEXT NOT NULL,
  evidence_ref  TEXT,
  needs_review  INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS followups (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL,
  issue_id      INTEGER REFERENCES issues(id) ON DELETE SET NULL,
  fingerprint   TEXT,
  title         TEXT NOT NULL,
  description   TEXT NOT NULL DEFAULT '',
  owner         TEXT NOT NULL,
  owner_kind    TEXT NOT NULL DEFAULT 'internal',
  status        TEXT NOT NULL,   -- OPEN | IN_PROGRESS | DONE | CANCELLED
  due_date      TEXT,
  evidence_json TEXT NOT NULL DEFAULT '[]',
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS followup_events (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  followup_id TEXT NOT NULL REFERENCES followups(id) ON DELETE CASCADE,
  at          TEXT NOT NULL,
  actor       TEXT NOT NULL,
  event_type  TEXT NOT NULL,   -- CREATED | STATUS_CHANGED | EDITED | REASSIGNED | NOTE
  from_value  TEXT,
  to_value    TEXT,
  note        TEXT
);

CREATE TABLE IF NOT EXISTS deadline_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id  TEXT NOT NULL,
  changed_at  TEXT NOT NULL,
  from_date   TEXT,
  to_date     TEXT NOT NULL
);

-- Riwayat versi record: data terlambat dan record yang tergantikan tetap disimpan,
-- tidak pernah dibuang meski bukan lagi nilai yang dipakai untuk perhitungan.
CREATE TABLE IF NOT EXISTS record_versions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  source_kind  TEXT NOT NULL,
  source_ref_id TEXT NOT NULL,
  project_id   TEXT NOT NULL,
  observed_at  TEXT,
  ingested_at  TEXT NOT NULL,
  raw_json     TEXT NOT NULL,
  reason       TEXT NOT NULL,   -- LATE_ARRIVAL | SUPERSEDED
  current_record_id INTEGER
);

CREATE INDEX IF NOT EXISTS idx_versions_ref ON record_versions (source_kind, source_ref_id);

