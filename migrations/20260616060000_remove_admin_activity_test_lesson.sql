-- Remove admin-activity-test (lesson_number 99). Admins test each real lesson via
-- Admin → Students → Test on L1 / L2 / L3 (same test-lesson page, lessonId from row).

BEGIN;

DELETE FROM student_lessons WHERE slug = 'admin-activity-test';

COMMIT;
