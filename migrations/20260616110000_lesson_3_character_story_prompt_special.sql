-- Character story card 1: ask what makes the character special

BEGIN;

UPDATE student_lesson_activities la
SET content = jsonb_set(
  la.content,
  '{prompts,0}',
  '"What makes your character special?"'::jsonb
)
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_character_story'
  AND la.content->'prompts'->>0 = 'Who is your character? What is their name?';

COMMIT;
