-- Personality vocab: add negative words + Thai on tap (activity 4)

BEGIN;

UPDATE student_lesson_activities la
SET
  description = 'Study positive, negative, and neutral personality words (about 4 minutes). Tap a word to see Thai.',
  content = '{"group_by_category": true, "show_thai": false, "tap_thai_translation": true, "study_seconds": 120}'::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 4;

DELETE FROM student_vocabulary_items vi
USING student_lesson_activities la, student_lessons sl
WHERE vi.activity_id = la.id
  AND la.student_lesson_id = sl.id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 4;

INSERT INTO student_vocabulary_items (activity_id, english_word, thai_translation, category, image_url, sort_order)
SELECT la.id, v.word, v.thai, v.category, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('friendly', 'เป็นมิตร', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Twemoji12_1f91d.svg', 1),
  ('kind', 'ใจดี', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg', 2),
  ('funny', 'ตลก', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg', 3),
  ('clever', 'ฉลาด', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/8/84/Light_bulb_icon_red.svg', 4),
  ('creative', 'สร้างสรรค์', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Twemoji_270f.svg', 5),
  ('helpful', 'ช่วยเหลือ', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/7/78/Twemoji12_1f64c.svg', 6),
  ('serious', 'จริงจัง', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/c/cf/Twemoji12_1f610.svg', 7),
  ('quiet', 'เงียบ', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/2/22/Twemoji12_1f92b.svg', 8),
  ('confident', 'มั่นใจ', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_1f60e.svg', 9),
  ('shy', 'ขี้อาย', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Twemoji12_1f633.svg', 10),
  ('lazy', 'ขี้เกียจ', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/4/40/Twemoji12_1f634.svg', 11),
  ('rude', 'ไม่สุภาพ', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Twemoji12_1f621.svg', 12),
  ('selfish', 'เห็นแก่ตัว', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Twemoji_1f4b0.svg', 13),
  ('mean', 'ใจร้าย', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Twemoji12_1f624.svg', 14)
) AS v(word, thai, category, image_url, sort_order)
WHERE sl.slug = 'design-your-own-character' AND la.activity_order = 4;

COMMIT;
