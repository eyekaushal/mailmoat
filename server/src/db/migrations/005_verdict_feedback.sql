-- "Not phishing" is a user-sourced fact shown next to the verdict; the verdict itself is never
-- lowered (invariant 5).
ALTER TABLE verdicts ADD COLUMN user_feedback TEXT;
