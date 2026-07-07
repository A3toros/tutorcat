-- Admin "punish" / remedial: assign main-app platform lessons to specific students.
-- When a student has rows here, their dashboard shows ONLY these lessons (not student_lessons).
-- lessons.id is a string slug (e.g. A1-L1, Pre-A1-L3), not UUID.

CREATE TABLE IF NOT EXISTS student_platform_lesson_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lesson_id TEXT NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes TEXT,
  CONSTRAINT student_platform_lesson_assignments_unique UNIQUE (user_id, lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_student_platform_lesson_assignments_user
  ON student_platform_lesson_assignments (user_id, assigned_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_platform_lesson_assignments_lesson
  ON student_platform_lesson_assignments (lesson_id);

COMMENT ON TABLE student_platform_lesson_assignments IS
  'Per-student platform lesson (lessons table) assignments. Non-empty set restricts student dashboard to these lessons only.';
