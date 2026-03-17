-- Unify live classifier storage into ONE table.
-- Replaces:
-- - speech_job_features
-- - live_read_vs_speak_model

DROP TABLE IF EXISTS speech_job_features;
DROP TABLE IF EXISTS live_read_vs_speak_model;

CREATE TABLE IF NOT EXISTS classifier_store (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('model', 'recording')),
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_classifier_store_kind_updated_at
  ON classifier_store (kind, updated_at DESC);

-- Seed model state (online logistic regression for spoken vs reading)
INSERT INTO classifier_store (key, kind, payload, updated_at)
VALUES (
  'read_vs_speak:model:v1',
  'model',
  '{
    "feature_names":["pause_ratio","filler_ratio","wps","voiced_ratio","pause_entropy"],
    "weights":{"pause_ratio":0,"filler_ratio":0,"wps":0,"voiced_ratio":0,"pause_entropy":0},
    "intercept":0,
    "learning_rate":0.15,
    "l2":0.001,
    "samples_seen":0
  }'::jsonb,
  NOW()
)
ON CONFLICT (key) DO NOTHING;

