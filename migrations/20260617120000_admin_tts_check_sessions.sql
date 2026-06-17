-- Admin TTS calibration sessions (labeled samples for robotic-voice tuning)

CREATE TABLE IF NOT EXISTS admin_tts_check_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  topic_id VARCHAR(64) NOT NULL,
  topic_title VARCHAR(255) NOT NULL,
  delivery_method VARCHAR(64) NOT NULL,
  job_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  transcripts JSONB NOT NULL DEFAULT '{}'::jsonb,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_tts_check_sessions_created
  ON admin_tts_check_sessions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_tts_check_sessions_delivery
  ON admin_tts_check_sessions (delivery_method, created_at DESC);

COMMENT ON TABLE admin_tts_check_sessions IS 'Admin-labeled speaking samples for robotic voice detector calibration.';
COMMENT ON COLUMN admin_tts_check_sessions.delivery_method IS 'human_mic | google_translate_tts | ai_voice_tts | speaker_playback';
COMMENT ON COLUMN admin_tts_check_sessions.job_ids IS 'speech_jobs.id values from the same pipeline as students.';
