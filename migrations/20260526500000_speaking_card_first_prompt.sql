-- Speaking cards: update first prompt text

BEGIN;

UPDATE student_lesson_activities sla
SET
  content = jsonb_set(
    COALESCE(sla.content, '{}'::jsonb),
    '{prompts,0}',
    '"What app you use the most and why do you like it?"'::jsonb,
    true
  ),
  updated_at = NOW()
FROM student_lessons sl
WHERE sla.student_lesson_id = sl.id
  AND sl.slug = 'my-online-life'
  AND sla.activity_type = 'student_speaking_cards'
  AND sla.activity_order = 14;

COMMIT;
