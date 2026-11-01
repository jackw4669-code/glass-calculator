-- Migration number: 0004 	 2026-11-01T17:00:00.000Z
-- Just what has changed. Every save or delete of a job takes the next
-- number from one counter, and a deleted job leaves a note behind, so each
-- machine can ask for only what has changed since it last looked, instead
-- of loading the whole job book every ten seconds.
ALTER TABLE jobs ADD COLUMN seq INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_jobs_seq ON jobs(seq);
CREATE TABLE job_seq (id INTEGER PRIMARY KEY CHECK (id = 1), n INTEGER NOT NULL);
INSERT INTO job_seq (id, n) VALUES (1, 0);
CREATE TABLE job_deletes (id TEXT PRIMARY KEY, seq INTEGER NOT NULL, deleted_at TEXT NOT NULL);
CREATE INDEX idx_job_deletes_seq ON job_deletes(seq);
