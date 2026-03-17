-- Public recordings review: button press event log + aggregate stats + whisper logs
-- Used by Netlify functions:
-- - public-track-recording
-- - public-get-recording-stats
-- - public-sync-whisper-log

CREATE TABLE IF NOT EXISTS recording_button_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_key TEXT NOT NULL,
  "group" TEXT NOT NULL CHECK ("group" IN ('mode', 'suspect')),
  choice TEXT NOT NULL,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_recording_button_events_base_key_created_at
  ON recording_button_events (base_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recording_button_events_group_choice_created_at
  ON recording_button_events ("group", choice, created_at DESC);

CREATE TABLE IF NOT EXISTS recording_button_stats (
  base_key TEXT PRIMARY KEY,
  reading_count BIGINT NOT NULL DEFAULT 0,
  speaking_count BIGINT NOT NULL DEFAULT 0,
  not_sure_count BIGINT NOT NULL DEFAULT 0,
  ai_count BIGINT NOT NULL DEFAULT 0,
  google_translate_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS whisper_logs (
  base_key TEXT PRIMARY KEY,
  storage_filename TEXT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

