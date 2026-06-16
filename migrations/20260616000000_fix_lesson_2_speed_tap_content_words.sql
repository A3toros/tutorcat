-- Fix lesson 2 speed tap: stream is not a content word (meme/video/trend are).
-- Also align student-facing copy with "content words" instead of generic activity wording.

BEGIN;

UPDATE student_lesson_activities la
SET
  description = 'Words move across the screen. Tap all content words only (tap again to unselect). Hold the row to pause it. Press Continue when you are done.',
  content = '{"targets": ["meme", "video", "trend"], "distractors": ["creator", "watch", "funny", "stream"]}'::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'meme-culture-internet-trends'
  AND la.activity_order = 6
  AND la.activity_type = 'student_vocab_speed_tap';

COMMIT;
