-- Whether the Risk Engine flagged a prompt-injection attempt. Stored so rules and the UI read the
-- Risk Engine's decision instead of re-deriving it from signals.
ALTER TABLE verdicts ADD COLUMN injection_attempt INTEGER NOT NULL DEFAULT 0;
