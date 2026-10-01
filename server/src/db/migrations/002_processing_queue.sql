-- New mail found by sync waits here until the security pipeline has handled it.
-- Backfilled (historical) mail is stored with pending = 0 and is not run through the pipeline.
ALTER TABLE emails ADD COLUMN pending INTEGER NOT NULL DEFAULT 0;
ALTER TABLE emails ADD COLUMN attempts INTEGER NOT NULL DEFAULT 0;
CREATE INDEX emails_pending ON emails (pending) WHERE pending = 1;
