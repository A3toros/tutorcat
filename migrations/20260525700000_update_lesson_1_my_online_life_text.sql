-- Lesson 1: rename topic and update communication goal (existing installs)

BEGIN;

UPDATE student_lessons
SET
  topic = 'My Online Life',
  communication_goal = 'Practice speaking about online life.',
  updated_at = NOW()
WHERE slug = 'my-online-life';

COMMIT;
