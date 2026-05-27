-- Allow graded polls (e.g. emoji → feeling exit ticket)
-- If correct_option_id is set, student must pick that option to proceed.

BEGIN;

ALTER TABLE student_poll_items
  ADD COLUMN IF NOT EXISTS correct_option_id TEXT;

COMMIT;

