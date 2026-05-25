-- Speed tap: 45s timer, 50% pass threshold, toggle-friendly config

BEGIN;

UPDATE student_lesson_activities sla
SET
  description = 'Tap activity words only. Tap again to unselect. Pass: 50%.',
  content = COALESCE(sla.content, '{}'::jsonb) || '{"duration_seconds": 45, "pass_percent": 50}'::jsonb,
  updated_at = NOW()
FROM student_lessons sl
WHERE sla.student_lesson_id = sl.id
  AND sl.slug = 'my-online-life'
  AND sla.activity_type = 'student_vocab_speed_tap'
  AND sla.activity_order = 6;

COMMIT;
