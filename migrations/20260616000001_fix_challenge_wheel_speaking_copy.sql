-- Fix challenge wheel title/description: "speaking" not "speak"

BEGIN;

UPDATE student_lesson_activities
SET
  title = 'Challenge: 30-second speaking',
  description = 'Spin the wheel and practice speaking for 30 seconds.'
WHERE activity_type = 'student_challenge_wheel'
  AND title = 'Challenge: 30-second speak';

COMMIT;
