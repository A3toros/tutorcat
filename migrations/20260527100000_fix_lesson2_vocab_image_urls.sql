-- Fix Lesson 2 vocab images: verified Commons upload.wikimedia.org URLs
-- (Twemoji12 hashes from Commons API; OOjs + YouTube from L1-verified paths)
-- Safe to re-run.

BEGIN;

UPDATE student_vocabulary_items vi
SET image_url = CASE lower(trim(vi.english_word))
  WHEN 'meme' THEN 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg'
  WHEN 'trend' THEN 'https://upload.wikimedia.org/wikipedia/commons/b/be/Twemoji12_1f4c8.svg'
  WHEN 'challenge' THEN 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Twemoji12_1f3c6.svg'
  WHEN 'video' THEN 'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg'
  WHEN 'creator' THEN 'https://upload.wikimedia.org/wikipedia/commons/5/52/Twemoji12_1f4f9.svg'
  WHEN 'stream' THEN 'https://upload.wikimedia.org/wikipedia/commons/2/21/YouTube_icon_%282011-2013%29.svg'
  WHEN 'hashtag' THEN 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Twemoji12_23-20e3.svg'
  WHEN 'comment' THEN 'https://upload.wikimedia.org/wikipedia/commons/f/f2/OOjs_UI_icon_speechBubble-ltr-progressive.svg'
  WHEN 'follower' THEN 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Twemoji12_1f465.svg'
  WHEN 'viral' THEN 'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f525.svg'
  WHEN 'watch' THEN 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Twemoji12_1f440.svg'
  WHEN 'share' THEN 'https://upload.wikimedia.org/wikipedia/commons/0/09/OOjs_UI_icon_share-progressive.svg'
  WHEN 'follow' THEN 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Twemoji12_1f464.svg'
  WHEN 'post' THEN 'https://upload.wikimedia.org/wikipedia/commons/0/09/OOjs_UI_icon_share-progressive.svg'
  WHEN 'react' THEN 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg'
  WHEN 'create' THEN 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Twemoji_270f.svg'
  WHEN 'funny' THEN 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg'
  WHEN 'weird' THEN 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Twemoji12_1f914.svg'
  WHEN 'cool' THEN 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_1f60e.svg'
  WHEN 'boring' THEN 'https://upload.wikimedia.org/wikipedia/commons/4/40/Twemoji12_1f634.svg'
  WHEN 'interesting' THEN 'https://upload.wikimedia.org/wikipedia/commons/8/84/Light_bulb_icon_red.svg'
  WHEN 'popular' THEN 'https://upload.wikimedia.org/wikipedia/commons/9/99/OOjs_UI_icon_star.svg'
  ELSE vi.image_url
END
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE vi.activity_id = la.id
  AND sl.slug = 'meme-culture-internet-trends'
  AND la.activity_order IN (2, 3);

COMMIT;
