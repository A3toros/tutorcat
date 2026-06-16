-- Character story → speaking cards about the student's character

BEGIN;

UPDATE student_lesson_activities la
SET
  description = 'Talk about your character. Answer each question out loud — AI will listen and give feedback.',
  content = $json${
    "source_activity_order": 1,
    "prompts": [
      "What makes your character special?",
      "What does your character look like?",
      "What is your character's personality?",
      "What does your character like to do?"
    ]
  }$json$::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_character_story';

COMMIT;
