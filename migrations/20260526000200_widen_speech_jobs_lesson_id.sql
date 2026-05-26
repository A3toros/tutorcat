-- Fix speech-job 500s when lesson_id is a UUID string (36 chars).
-- Some environments have speech_jobs.lesson_id as VARCHAR(20).

ALTER TABLE speech_jobs
  ALTER COLUMN lesson_id TYPE TEXT;

