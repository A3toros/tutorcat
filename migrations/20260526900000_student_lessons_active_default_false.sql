-- New student_lessons default to inactive; admin enables when ready for students.
-- Existing lesson 1 stays active for the current class.

BEGIN;

ALTER TABLE student_lessons
  ALTER COLUMN active SET DEFAULT FALSE;

-- Keep deployed lesson 1 visible to students (adjust if you add more seeded lessons)
UPDATE student_lessons
SET active = TRUE
WHERE lesson_number = 1;

COMMIT;
