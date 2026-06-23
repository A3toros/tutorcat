-- Lesson 4: portrait activity copy (slug: create-your-superhero ONLY)

BEGIN;

UPDATE student_lesson_activities la
SET description = 'The Magic Hat will generate your superhero portrait based on your choices.'
FROM student_lessons sl
WHERE la.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND la.activity_order = 15
  AND la.activity_type = 'student_superhero_image_generate';

COMMIT;
