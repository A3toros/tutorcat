-- Vocab intro: 60s study timer before Continue (existing lesson 1)

BEGIN;

UPDATE student_lesson_activities sla
SET content = COALESCE(sla.content, '{}'::jsonb) || '{"study_seconds": 60}'::jsonb,
    updated_at = NOW()
FROM student_lessons sl
WHERE sla.student_lesson_id = sl.id
  AND sl.slug = 'my-online-life'
  AND sla.activity_type = 'student_vocabulary_intro'
  AND sla.activity_order = 2;

COMMIT;
