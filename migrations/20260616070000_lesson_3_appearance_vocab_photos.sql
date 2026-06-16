-- Lesson 3 appearance vocabulary: Wikimedia photos + Thai on tap (activity 2)

BEGIN;

UPDATE student_lesson_activities la
SET
  description = 'Study appearance, clothes, and color words (about 4 minutes). Tap a word to see Thai.',
  content = '{"group_by_category": true, "show_thai": false, "tap_thai_translation": true, "study_seconds": 120}'::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 2;

DELETE FROM student_vocabulary_items vi
USING student_lesson_activities la, student_lessons sl
WHERE vi.activity_id = la.id
  AND la.student_lesson_id = sl.id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 2;

INSERT INTO student_vocabulary_items (activity_id, english_word, thai_translation, category, image_url, sort_order)
SELECT la.id, v.word, v.thai, v.category, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('tall', 'สูง', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Yao_Ming.jpg', 1),
  ('short', 'เตี้ย', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/4/47/Little_girl.jpg', 2),
  ('young', 'อายุน้อย', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/b/b0/A_young_boy_smiling.jpg', 3),
  ('hair', 'ผม', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/7/75/Long_hair.jpg', 4),
  ('eyes', 'ตา', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Woman_eyes_close-up.jpg', 5),
  ('shirt', 'เสื้อ', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/0/09/T-shirt.jpg', 6),
  ('pants', 'กางเกง', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Jeans.jpg', 7),
  ('shoes', 'รองเท้า', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Running_shoes.jpg', 8),
  ('jacket', 'แจ็กเกット', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/9/93/Leather_jacket.jpg', 9),
  ('dress', 'ชุดเดรส', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/6/63/Dress.jpg', 10),
  ('blue', 'สีน้ำเงิน', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Sky.jpg', 11),
  ('green', 'สีเขียว', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Green_leaves.jpg', 12),
  ('brown', 'สีน้ำตาล', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Wood.jpg', 13),
  ('black', 'สีดำ', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/5/50/Black_colour.jpg', 14),
  ('blond', 'สีบลอนด์', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Blonde_hair.jpg', 15)
) AS v(word, thai, category, image_url, sort_order)
WHERE sl.slug = 'design-your-own-character' AND la.activity_order = 2;

COMMIT;
