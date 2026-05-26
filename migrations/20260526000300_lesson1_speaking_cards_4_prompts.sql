-- Lesson 1 (my-online-life): reduce speaking cards to 4 prompts.

BEGIN;

UPDATE student_lesson_activities sla
SET
  content = jsonb_set(
    COALESCE(sla.content, '{}'::jsonb),
    '{prompts}',
    '[
      "What app you use the most and why do you like it?",
      "What games do you play on your computer or mobile phone and what do you like about them?",
      "Do you think children should spend a lot of time online? why?",
      "Is TikTok good or bad for you? explain why"
    ]'::jsonb,
    true
  ),
  updated_at = NOW()
FROM student_lessons sl
WHERE sla.student_lesson_id = sl.id
  AND sl.slug = 'my-online-life'
  AND sla.activity_type = 'student_speaking_cards'
  AND sla.activity_order = 14;

COMMIT;

