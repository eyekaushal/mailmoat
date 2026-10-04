-- The inbox list shows the subject and a short snippet (PLAN §13.1 decision 1). Bodies are still
-- never stored. NULL means "not fetched yet": the next sync pass fills existing rows.
ALTER TABLE emails ADD COLUMN subject TEXT;
ALTER TABLE emails ADD COLUMN snippet TEXT;
