-- Lesson 4: remove separate selfie activity (#14); renumber 15–18 → 14–17 (17 activities total)
-- Slug: create-your-superhero ONLY
-- Uses +100 bump to avoid student_lesson_activities_order_unique collisions.

BEGIN;

DELETE FROM student_lesson_activity_results r
USING student_lessons sl
WHERE r.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND r.activity_order = 14;

UPDATE student_lesson_activity_results r
SET activity_order = activity_order + 100
FROM student_lessons sl
WHERE r.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND r.activity_order IN (15, 16, 17, 18);

UPDATE student_lesson_activity_results r
SET activity_order = activity_order - 101
FROM student_lessons sl
WHERE r.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND r.activity_order IN (115, 116, 117, 118);

DELETE FROM student_lesson_activities la
USING student_lessons sl
WHERE la.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND la.activity_order = 14
  AND la.activity_type = 'student_selfie_capture';

UPDATE student_lesson_activities la
SET activity_order = activity_order + 100
FROM student_lessons sl
WHERE la.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND la.activity_order IN (15, 16, 17, 18);

UPDATE student_lesson_activities la
SET activity_order = activity_order - 101
FROM student_lessons sl
WHERE la.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND la.activity_order IN (115, 116, 117, 118);

UPDATE student_lesson_activities la
SET description = 'The Magic Hat will generate your superhero portrait based on your choices.'
FROM student_lessons sl
WHERE la.student_lesson_id = sl.id
  AND sl.slug = 'create-your-superhero'
  AND la.activity_order = 15
  AND la.activity_type = 'student_superhero_image_generate';

COMMIT;
