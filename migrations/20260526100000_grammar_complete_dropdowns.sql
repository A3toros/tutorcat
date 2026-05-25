-- Complete the sentence: dropdown apps + reasons

BEGIN;

UPDATE student_lesson_activities sla
SET
  description = 'Choose an app and a reason to complete the sentence.',
  content = '{
    "template": "My favorite app is {app} because {reason}.",
    "apps": ["Instagram", "TikTok", "Facebook", "YouTube"],
    "reasons": ["I can watch videos", "I can chat with friends", "it is fun", "I learn new things"]
  }'::jsonb,
  updated_at = NOW()
FROM student_lessons sl
WHERE sla.student_lesson_id = sl.id
  AND sl.slug = 'my-online-life'
  AND sla.activity_type = 'student_grammar_complete'
  AND sla.activity_order = 11;

COMMIT;
