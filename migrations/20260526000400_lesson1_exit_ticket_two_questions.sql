-- Lesson 1 exit ticket: replace Q1 only; keep Q2 and Q3.

BEGIN;

DELETE FROM student_poll_items spi
USING student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE spi.activity_id = la.id
  AND sl.slug = 'my-online-life'
  AND la.activity_order = 16;

INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, sort_order)
SELECT la.id, v.question, v.options::jsonb, FALSE, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    'What do you like the most?',
    '[{"id": "tiktok", "label": "TikTok"}, {"id": "youtube", "label": "YouTube"}, {"id": "instagram", "label": "Instagram"}, {"id": "games", "label": "Games"}]',
    1
  ),
  (
    'What do you do most online?',
    '[{"id": "videos", "label": "Watch videos"}, {"id": "games", "label": "Play games"}, {"id": "chat", "label": "Chat"}, {"id": "music", "label": "Listen to music"}]',
    2
  ),
  (
    'What is hardest to live without?',
    '[{"id": "phone", "label": "Phone"}, {"id": "internet", "label": "Internet"}, {"id": "games", "label": "Games"}, {"id": "music", "label": "Music"}]',
    3
  )
) AS v(question, options, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 16;

COMMIT;
