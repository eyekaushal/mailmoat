-- The name the USER used when writing to a contact (from To/Cc of sent mail). Names from received
-- mail are never stored: the From display name is attacker-controlled. Feeds signal S7.
ALTER TABLE contacts ADD COLUMN name TEXT;
