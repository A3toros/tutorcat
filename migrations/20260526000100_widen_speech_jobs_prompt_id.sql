-- Fix speech-job 500s when prompt_id exceeds 20 chars.
-- Some environments have speech_jobs.prompt_id as VARCHAR(20); student prompt ids are longer.

ALTER TABLE speech_jobs
  ALTER COLUMN prompt_id TYPE TEXT;

