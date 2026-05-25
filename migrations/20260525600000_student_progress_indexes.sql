-- Student progress: indexes for fast load (mirrors platform lesson progress patterns)

BEGIN;

-- user_progress lookup by user + lesson (UNIQUE exists; index supports dashboard joins)
CREATE INDEX IF NOT EXISTS idx_student_user_progress_user_lesson
  ON student_user_progress (user_id, student_lesson_id);

-- Activity results: resolve by order (upsert + resume by activity_order)
CREATE UNIQUE INDEX IF NOT EXISTS student_lesson_activity_results_user_lesson_order
  ON student_lesson_activity_results (user_id, student_lesson_id, activity_order);

-- Submit: resolve activity_id from lesson + order
CREATE INDEX IF NOT EXISTS idx_student_lesson_activities_lesson_order
  ON student_lesson_activities (student_lesson_id, activity_order)
  WHERE active = TRUE;

COMMIT;
