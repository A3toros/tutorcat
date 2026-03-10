-- Speech jobs: one row per submission. Transcript stored server-side; analysis runs on first poll.
-- Run in Neon (or Supabase) SQL editor before using POST /speech-job and GET /analysis-result.
-- Matches scripts/database_schema.sql.

CREATE TABLE IF NOT EXISTS speech_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  transcript TEXT NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'analyzing', 'completed', 'failed')),
  result_json JSONB,
  error TEXT,
  prompt TEXT,
  prompt_id TEXT,
  cefr_level TEXT,
  min_words INTEGER,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speech_jobs_status ON speech_jobs(status);
CREATE INDEX IF NOT EXISTS idx_speech_jobs_created_at ON speech_jobs(created_at DESC);
