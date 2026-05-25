-- MCQ: use "(blank)" choice value so blank option is tappable (not empty string)

BEGIN;

UPDATE student_grammar_items gi
SET
  correct_sentence = '(blank)',
  options = '{"choices": ["am", "do", "(blank)"], "correct": "(blank)"}'::jsonb
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE gi.activity_id = la.id
  AND sl.slug = 'my-online-life'
  AND la.activity_order = 9
  AND gi.sort_order = 2;

COMMIT;
