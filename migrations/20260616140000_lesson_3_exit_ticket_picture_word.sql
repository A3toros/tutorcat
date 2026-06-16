-- Lesson 3 exit ticket: match pictures to words (graded)

BEGIN;

INSERT INTO student_lesson_activities (student_lesson_id, activity_type, activity_order, title, description, content, estimated_time_seconds)
SELECT
  sl.id,
  'student_exit_poll',
  9,
  'Exit ticket: Picture → word',
  'Match each picture to the correct word before you finish the lesson.',
  '{}'::jsonb,
  180
FROM student_lessons sl
WHERE sl.slug = 'design-your-own-character'
  AND NOT EXISTS (
    SELECT 1 FROM student_lesson_activities la
    WHERE la.student_lesson_id = sl.id AND la.activity_order = 9
  );

DELETE FROM student_poll_items pi
USING student_lesson_activities la, student_lessons sl
WHERE pi.activity_id = la.id
  AND la.student_lesson_id = sl.id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 9;

UPDATE student_lesson_activities la
SET
  activity_type = 'student_exit_poll',
  title = 'Exit ticket: Picture → word',
  description = 'Match each picture to the correct word before you finish the lesson.',
  content = '{}'::jsonb,
  estimated_time_seconds = 180
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_order = 9;

INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, correct_option_id, sort_order)
SELECT la.id, v.question, v.options::jsonb, FALSE, v.correct_id, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    'https://upload.wikimedia.org/wikipedia/commons/3/3e/Twemoji12_1f91d.svg',
    '[{"id": "friendly", "label": "friendly"}, {"id": "shirt", "label": "shirt"}, {"id": "lazy", "label": "lazy"}, {"id": "tall", "label": "tall"}]',
    'friendly',
    1
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/0/09/T-shirt.jpg',
    '[{"id": "shirt", "label": "shirt"}, {"id": "pants", "label": "pants"}, {"id": "dress", "label": "dress"}, {"id": "jacket", "label": "jacket"}]',
    'shirt',
    2
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/7/75/Long_hair.jpg',
    '[{"id": "hair", "label": "hair"}, {"id": "eyes", "label": "eyes"}, {"id": "young", "label": "young"}, {"id": "blond", "label": "blond"}]',
    'hair',
    3
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg',
    '[{"id": "kind", "label": "kind"}, {"id": "mean", "label": "mean"}, {"id": "rude", "label": "rude"}, {"id": "selfish", "label": "selfish"}]',
    'kind',
    4
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg',
    '[{"id": "funny", "label": "funny"}, {"id": "serious", "label": "serious"}, {"id": "quiet", "label": "quiet"}, {"id": "shy", "label": "shy"}]',
    'funny',
    5
  )
) AS v(question, options, correct_id, sort_order)
WHERE sl.slug = 'design-your-own-character' AND la.activity_order = 9;

COMMIT;
