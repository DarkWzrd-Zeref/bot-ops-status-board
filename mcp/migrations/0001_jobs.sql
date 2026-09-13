CREATE TABLE IF NOT EXISTS jobs (
  task_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  parent_id TEXT,
  contract_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('READY', 'CLAIMED', 'WORKING', 'REVIEW', 'BLOCKED', 'DONE')),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  packet_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS jobs_owner_updated
  ON jobs (owner_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS jobs_owner_status
  ON jobs (owner_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS job_events (
  event_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES jobs(task_id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  from_status TEXT,
  to_status TEXT NOT NULL,
  actor TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS job_events_task_created
  ON job_events (task_id, created_at ASC);
