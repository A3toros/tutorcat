-- Speed up "what did this session vote on?" lookups for /recordings UI

CREATE INDEX IF NOT EXISTS idx_recording_button_events_session_base_group_created_at
  ON recording_button_events (session_id, base_key, "group", created_at DESC);

