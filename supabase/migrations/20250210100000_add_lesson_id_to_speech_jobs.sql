-- Add lesson_id to speech_jobs for lookups by lesson when user loads from another device.
-- Run in Neon (or Supabase) SQL editor.

ALTER TABLE speech_jobs
  ADD COLUMN IF NOT EXISTS lesson_id VARCHAR(20);

CREATE INDEX IF NOT EXISTS idx_speech_jobs_user_lesson
  ON speech_jobs(user_id, lesson_id)
  WHERE lesson_id IS NOT NULL;

COMMENT ON COLUMN speech_jobs.lesson_id IS 'Lesson id (e.g. A1-L1) for fetching jobs by user+lesson when restoring on another device.';
