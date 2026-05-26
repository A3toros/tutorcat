-- Speed tap: no timer; select all targets only, then Continue

BEGIN;

UPDATE student_lesson_activities sla
SET
  description = 'Select all activity words (no distractors), then tap Continue.',
  content = '{"targets": ["play games", "scroll", "upload", "message"], "distractors": ["interesting", "phone"]}'::jsonb,
  updated_at = NOW()
FROM student_lessons sl
WHERE sla.student_lesson_id = sl.id
  AND sl.slug = 'my-online-life'
  AND sla.activity_type = 'student_vocab_speed_tap'
  AND sla.activity_order = 6;

COMMIT;
