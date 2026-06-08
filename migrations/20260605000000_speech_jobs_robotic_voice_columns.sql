-- Fast-query columns for robotic / TTS voice detector (log + block modes).
-- Scores are also stored in result_json.robotic_voice for full signal detail.

ALTER TABLE IF EXISTS speech_jobs
  ADD COLUMN IF NOT EXISTS robotic_voice_score SMALLINT
    CHECK (robotic_voice_score IS NULL OR (robotic_voice_score >= 0 AND robotic_voice_score <= 100)),
  ADD COLUMN IF NOT EXISTS robotic_voice_would_flag BOOLEAN,
  ADD COLUMN IF NOT EXISTS robotic_voice_flagged BOOLEAN,
  ADD COLUMN IF NOT EXISTS robotic_voice_rules JSONB;

CREATE INDEX IF NOT EXISTS idx_speech_jobs_robotic_voice_score
  ON speech_jobs (robotic_voice_score DESC NULLS LAST, created_at DESC)
  WHERE robotic_voice_score IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_speech_jobs_robotic_voice_would_flag
  ON speech_jobs (created_at DESC)
  WHERE robotic_voice_would_flag = TRUE;

COMMENT ON COLUMN speech_jobs.robotic_voice_score IS '0–100 TTS/robotic voice likelihood; NULL if not scored yet.';
COMMENT ON COLUMN speech_jobs.robotic_voice_would_flag IS 'True when rules would block in log mode (threshold met).';
COMMENT ON COLUMN speech_jobs.robotic_voice_flagged IS 'True when actually blocked (ROBOTIC_VOICE_MODE=block).';
COMMENT ON COLUMN speech_jobs.robotic_voice_rules IS 'Rule ids that fired, e.g. ["flat_pitch","uniform_segments"].';
