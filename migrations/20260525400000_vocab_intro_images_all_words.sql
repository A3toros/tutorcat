-- Lesson 1 vocab: fix image URLs (verified filenames) + remove duplicates
-- Superseded by 20260525500000_fix_vocab_image_urls_verified.sql for full URL set.
-- Re-run 20260525500000 in Neon after this if images still 404.

BEGIN;

DELETE FROM student_vocabulary_items a
USING student_vocabulary_items b,
  student_lesson_activities la,
  student_lessons sl
WHERE a.activity_id = b.activity_id
  AND a.english_word = b.english_word
  AND a.id > b.id
  AND la.id = a.activity_id
  AND sl.id = la.student_lesson_id
  AND sl.slug = 'my-online-life'
  AND la.activity_order IN (2, 3);

-- Same CASE as 20260525500000 (kept in sync)
UPDATE student_vocabulary_items vi
SET image_url = CASE lower(trim(vi.english_word))
  WHEN 'app' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_advanced.svg'
  WHEN 'website' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Globe_icon.svg'
  WHEN 'phone' THEN 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Twemoji12_1f4f1.svg'
  WHEN 'tablet' THEN 'https://upload.wikimedia.org/wikipedia/commons/8/89/Twemoji12_1f4fb.svg'
  WHEN 'computer' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Emoji_u1f4bb.svg'
  WHEN 'internet' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Wifi.svg'
  WHEN 'chat' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_speechBubble-ltr-progressive.svg'
  WHEN 'message' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_message-progressive.svg'
  WHEN 'call' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Telephone%20icon%20blue%20gradient.svg'
  WHEN 'watch videos' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/YouTube%20full-color%20icon%20(2017).svg'
  WHEN 'play games' THEN 'https://upload.wikimedia.org/wikipedia/commons/6/65/Twemoji12_1f3ae.svg'
  WHEN 'listen to music' THEN 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Twemoji12_1f3a7.svg'
  WHEN 'stream' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Youtube%20icon.svg'
  WHEN 'post' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_share-progressive.svg'
  WHEN 'search' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_search-ltr-progressive.svg'
  WHEN 'scroll' THEN 'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f4f2.svg'
  WHEN 'download' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Icon%20Download%20Black.svg'
  WHEN 'upload' THEN 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Twemoji12_1f4e4.svg'
  WHEN 'fun' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Smiley.svg'
  WHEN 'boring' THEN 'https://upload.wikimedia.org/wikipedia/commons/4/40/Twemoji12_1f634.svg'
  WHEN 'interesting' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/Light%20bulb%20icon%20red.svg'
  WHEN 'useful' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs%20UI%20icon%20check-constructive.svg'
  WHEN 'funny' THEN 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg'
  WHEN 'exciting' THEN 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_star.svg'
  ELSE vi.image_url
END
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE vi.activity_id = la.id
  AND sl.slug = 'my-online-life'
  AND la.activity_order IN (2, 3);

COMMIT;
