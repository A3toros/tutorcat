-- Frequency: add "I _____ use YouTube." → always (and fix correct word in options)

BEGIN;

INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, options, sort_order)
SELECT la.id, 'frequency_select', 'I _____ use YouTube.', 'always',
  '{"choices": ["always", "asleaways", "alwasy"], "correct": "always"}'::jsonb, 2
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE sl.slug = 'my-online-life'
  AND la.activity_order = 10
  AND NOT EXISTS (
    SELECT 1 FROM student_grammar_items gi
    WHERE gi.activity_id = la.id AND gi.original_sentence = 'I _____ use YouTube.'
  );

UPDATE student_grammar_items gi
SET
  correct_sentence = 'always',
  options = '{"choices": ["always", "asleaways", "alwasy"], "correct": "always"}'::jsonb
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE gi.activity_id = la.id
  AND sl.slug = 'my-online-life'
  AND la.activity_order = 10
  AND (
    gi.original_sentence ILIKE '%youtube%'
    OR gi.original_sentence ILIKE '%YouTube%'
  );

COMMIT;
