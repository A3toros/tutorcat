-- Lesson 3 image→word MCQ: replace hard-to-see mouth card with a clear hair card

BEGIN;

UPDATE student_lesson_activities la
SET content = jsonb_set(
  la.content,
  '{items,3}',
  '{
    "image_url": "/characters/hair/thumb34.png",
    "prompt": "This character has ___ hair.",
    "choices": ["short", "long", "curly", "blond"],
    "correct": "long"
  }'::jsonb
)
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 3
  AND la.activity_type = 'student_vocab_image_mcq';

COMMIT;

