-- Async superhero portrait jobs (Lesson 4 image-to-image pipeline; avoids Netlify sync timeout)

CREATE TABLE IF NOT EXISTS superhero_image_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users (id) ON DELETE SET NULL,
  student_lesson_id UUID REFERENCES student_lessons (id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'generating', 'completed', 'failed')),
  input_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_superhero_image_jobs_status
  ON superhero_image_jobs (status);

CREATE INDEX IF NOT EXISTS idx_superhero_image_jobs_user_lesson
  ON superhero_image_jobs (user_id, student_lesson_id, created_at DESC);
