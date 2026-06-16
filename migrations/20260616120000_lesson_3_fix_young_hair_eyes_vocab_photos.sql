-- Fix lesson 3 appearance vocab photos: young, hair, eyes (wrong Commons files)

BEGIN;

UPDATE student_vocabulary_items vi
SET image_url = v.image_url
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('young', 'https://upload.wikimedia.org/wikipedia/commons/b/b0/A_young_boy_smiling.jpg'),
  ('hair', 'https://upload.wikimedia.org/wikipedia/commons/7/75/Long_hair.jpg'),
  ('eyes', 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Woman_eyes_close-up.jpg')
) AS v(word, image_url)
WHERE vi.activity_id = la.id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 2
  AND lower(vi.english_word) = v.word;

COMMIT;
