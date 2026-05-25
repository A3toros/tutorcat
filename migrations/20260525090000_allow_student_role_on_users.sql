-- Allow role = 'student' on users (existing DB may have chk_users_role for user/admin only)
-- Run this BEFORE 20260525100000_student_track_tables_and_roster.sql if roster INSERT fails.

ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;

ALTER TABLE users ADD CONSTRAINT chk_users_role
  CHECK (role IN ('user', 'admin', 'student'));
