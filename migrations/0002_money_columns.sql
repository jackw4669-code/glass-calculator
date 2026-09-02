-- Money columns.
--
-- The app works entirely from the `data` JSON, so nothing here is needed
-- to make the job book run. These columns exist so the database can
-- answer money questions itself instead of every machine loading four
-- hundred jobs and adding them up in the browser.
--
-- done_at  the day a job went out, which is the day it counts
-- paid     the sum of its payments
-- cost     what the glass and materials cost us
-- net      the sale before VAT
--
-- SQLite only adds one column per statement.

ALTER TABLE jobs ADD COLUMN done_at TEXT;
ALTER TABLE jobs ADD COLUMN paid REAL DEFAULT 0;
ALTER TABLE jobs ADD COLUMN cost REAL;
ALTER TABLE jobs ADD COLUMN net REAL;

-- Backfill what can be read straight out of the JSON.
--
-- Jobs taken before payments existed carry a single `deposit` number,
-- and the app turns that into the first payment when it loads them, so
-- deposit is exactly the amount paid at this moment in time.
--
-- cost and net are left null. They depend on the cost rates and the
-- percentage fallback, which live in the app rather than in the row, so
-- they fill in as jobs are saved from here on.

UPDATE jobs
   SET done_at = substr(json_extract(data, '$.doneAt'), 1, 10),
       paid    = COALESCE(json_extract(data, '$.deposit'), 0);

CREATE INDEX idx_jobs_done_at ON jobs(done_at);
CREATE INDEX idx_jobs_paid ON jobs(paid);
