-- Speaking cards: students practice with AI, not a classroom partner

BEGIN;

UPDATE student_lesson_activities sla
SET
  title = 'Speaking: Practice questions',
  description = 'Answer each question out loud. AI will listen and give you feedback.',
  updated_at = NOW()
FROM student_lessons sl
WHERE sla.student_lesson_id = sl.id
  AND sl.slug = 'my-online-life'
  AND sla.activity_type = 'student_speaking_cards'
  AND sla.activity_order = 14;

COMMIT;
