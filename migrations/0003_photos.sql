-- Photos.
--
-- Deliberately a table of their own rather than a field on the job.
-- Every machine loads every job on every refresh, so a picture sitting
-- inside `jobs.data` would be pulled down hundreds of times a day by
-- people who never open that job. Here, the bytes are fetched only when
-- somebody actually looks.
--
-- id     long random, because it is also the public link for suppliers
-- bytes  base64 of a shrunk JPEG, well under D1's one megabyte value cap

CREATE TABLE photos (
  id       TEXT PRIMARY KEY,
  job_id   TEXT NOT NULL,
  name     TEXT,
  mime     TEXT NOT NULL,
  bytes    TEXT NOT NULL,
  w        INTEGER,
  h        INTEGER,
  added_at TEXT NOT NULL,
  added_by TEXT
);

CREATE INDEX idx_photos_job ON photos(job_id);
