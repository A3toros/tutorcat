-- Frequency: one real word + nonsense distractors (no sometimes/never — habits vary)
-- Error fix: wrong "always" where never fits (YouTube word-order item unchanged)

BEGIN;

UPDATE student_grammar_items gi
SET options = '{"choices": ["always", "asleaways", "alwasy"], "correct": "always"}'::jsonb
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE gi.activity_id = la.id
  AND sl.slug = 'my-online-life'
  AND la.activity_order = 10
  AND gi.item_kind = 'frequency_select';

UPDATE student_grammar_items gi
SET
  original_sentence = 'I always post videos.',
  correct_sentence = 'I never post videos.'
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE gi.activity_id = la.id
  AND sl.slug = 'my-online-life'
  AND la.activity_order = 12
  AND gi.item_kind = 'error_correction'
  AND gi.sort_order = 1
  AND gi.original_sentence = 'I usually playing games.';

COMMIT;
