-- Ensure upsert by activity_order works (submit-student-lesson-activity ON CONFLICT fallback)

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS student_lesson_activity_results_user_lesson_order
  ON student_lesson_activity_results (user_id, student_lesson_id, activity_order);

COMMIT;
