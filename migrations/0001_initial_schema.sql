-- Migration number: 0001 	 2026-08-29T12:04:22.514Z
-- One row per job. The queryable fields are real columns; everything
-- else (pieces, add-ons, extras, costs, diary slots) stays as JSON so
-- the app's existing job object works untouched.
CREATE TABLE jobs (
 id TEXT PRIMARY KEY,
 no INTEGER NOT NULL,
 name TEXT NOT NULL,
 phone TEXT,
 email TEXT,
 trade INTEGER DEFAULT 0,
 status TEXT NOT NULL,
 confirmed INTEGER DEFAULT 0,
 wanted TEXT,
 total REAL DEFAULT 0,
 balance REAL DEFAULT 0,
 data TEXT NOT NULL,
 updated_at TEXT NOT NULL,
 updated_by TEXT,
 version INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_no ON jobs(no);
CREATE INDEX idx_jobs_name ON jobs(name);
CREATE INDEX idx_jobs_balance ON jobs(balance);
-- Prices, suppliers and settings: one row, overwritten each save.
CREATE TABLE settings (
 key TEXT PRIMARY KEY,
 value TEXT NOT NULL,
 updated_at TEXT NOT NULL
);