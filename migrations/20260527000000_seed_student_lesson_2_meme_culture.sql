-- Lesson 2: Meme Culture and Internet Trends — student track content seed
-- Prerequisite: 20260525100000_student_track_tables_and_roster.sql
-- Safe to re-run: deletes lesson by slug then re-inserts (CASCADE).
-- Starts INACTIVE — admin activates in Students → Student track lessons.

BEGIN;

DELETE FROM student_lessons WHERE slug = 'meme-culture-internet-trends';

INSERT INTO student_lessons (
  lesson_number,
  topic,
  slug,
  live_duration_minutes,
  communication_goal,
  grammar_focus,
  vocabulary_list,
  active,
  version
) VALUES (
  2,
  'Meme Culture and Internet Trends',
  'meme-culture-internet-trends',
  30,
  'Students talk about memes, trends, videos, and online content they enjoy.',
  $gf${
    "opinions": {
      "structure": "I think + noun/adjective",
      "examples": [
        "I think memes are funny.",
        "I think this trend is strange.",
        "I think this video is interesting."
      ]
    },
    "like_dislike": {
      "structure": "I like/dislike + because",
      "examples": [
        "I like memes because they are funny.",
        "I don't like prank videos because they are annoying.",
        "I like short videos because they are exciting."
      ]
    },
    "simple_present": {
      "structure": "Subject + verb + object",
      "examples": [
        "I watch meme videos.",
        "I follow trends online.",
        "I share funny pictures."
      ]
    },
    "adjectives": {
      "ladder": ["funny", "boring", "weird", "cool", "interesting", "exciting", "strange", "annoying", "creative", "popular"],
      "examples": [
        "I think this trend is cool.",
        "I think prank videos are annoying."
      ]
    }
  }$gf$::jsonb,
  $vl$[
    {"category": "Internet content", "words": ["meme", "trend", "challenge", "video", "creator", "stream", "hashtag", "comment", "follower", "viral"]},
    {"category": "Actions", "words": ["watch", "share", "follow", "post", "react", "create"]},
    {"category": "Opinion words", "words": ["funny", "weird", "cool", "boring", "interesting", "popular"]}
  ]$vl$::jsonb,
  FALSE,
  1
);

INSERT INTO student_lesson_activities (student_lesson_id, activity_type, activity_order, title, description, content)
SELECT sl.id, v.activity_type, v.activity_order, v.title, v.description, v.content::jsonb
FROM student_lessons sl
CROSS JOIN (VALUES
  (1, 'student_warmup_poll', 'Warmup: What do you watch?', 'What content do you watch most?', '{}'),
  (2, 'student_vocabulary_intro', 'Learn: Meme & trend vocabulary', 'Study these words before the games.', '{"group_by_category": true, "show_thai": false, "tap_thai_translation": true, "study_seconds": 60}'),
  (3, 'student_vocab_picture_match', 'Match: Picture → word', 'Tap a picture, then tap the matching word.', '{}'),
  (4, 'student_vocab_missing_letters', 'Spell: Missing letters', 'Type the full word.', '{"sentences": [{"template": "m__e", "answer": "meme"}, {"template": "tr__d", "answer": "trend"}, {"template": "v__al", "answer": "viral"}, {"template": "cr__tor", "answer": "creator"}, {"template": "fo__ower", "answer": "follower"}]}'),
  (5, 'student_vocab_categorize', 'Sort: Word categories', 'Tap a word, then tap its category.', '{"buckets": ["People", "Actions", "Content"]}'),
  (6, 'student_vocab_speed_tap', 'Speed: Content words', 'Words move across the screen. Tap all content words only (tap again to unselect). Hold the row to pause it. Press Continue when you are done.', '{"targets": ["meme", "video", "trend"], "distractors": ["creator", "watch", "funny", "stream"]}'),
  (7, 'student_grammar_builder', 'Grammar: Rules', 'Read the rules, then practice.', '{}'),
  (8, 'student_grammar_drag_order', 'Practice: Sentence order', 'Put the words in the correct order.', '{}'),
  (9, 'student_grammar_mcq', 'Practice: Choose answer', 'Pick the correct word.', '{}'),
  (10, 'student_grammar_mcq', 'Practice: Choose the correct words', 'Choose the correct words to complete the sentence.', '{}'),
  (11, 'student_grammar_error_fix', 'Practice: Fix the mistake', 'Write the correct sentence.', '{}'),
  (12, 'student_warmup_poll', 'Polls: Memes & trends', 'Answer all three questions.', '{}'),
  (13, 'student_speaking_cards', 'Speaking: Practice questions', 'Answer each question out loud. AI will listen and give you feedback.', '{"prompts": ["What videos do you watch and why?", "What internet trends do you like and why?", "Who is your favorite creator? Why do you like them?", "Do you share memes? What kind of memes?"]}'),
  (14, 'student_challenge_wheel', 'Challenge: 30-second speak', 'Spin the wheel and speak for 30 seconds.', '{"duration_seconds": 30, "prompts": ["My favorite meme", "Videos I watch", "Online trends", "My favorite creator", "Content I dislike"]}'),
  (15, 'student_exit_poll', 'Exit ticket: Emoji feelings', 'Match each emoji to the correct feeling.', '{}')
) AS v(activity_order, activity_type, title, description, content)
WHERE sl.slug = 'meme-culture-internet-trends';

-- Warmup poll (activity 1)
INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, sort_order)
SELECT la.id,
  'What content do you watch most?',
  '[{"id": "gaming", "label": "Gaming videos"}, {"id": "memes", "label": "Memes"}, {"id": "music", "label": "Music videos"}, {"id": "short", "label": "Short videos"}]'::jsonb,
  FALSE,
  1
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 1;

-- Vocabulary intro (activity 2)
INSERT INTO student_vocabulary_items (activity_id, english_word, thai_translation, category, image_url, sort_order)
SELECT la.id, v.word, v.thai, v.category, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('meme', 'มีม', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg', 1),
  ('trend', 'เทรนด์', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/b/be/Twemoji12_1f4c8.svg', 2),
  ('challenge', 'ชาเลนจ์', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/a/a1/Twemoji12_1f3c6.svg', 3),
  ('video', 'วิดีโอ', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg', 4),
  ('creator', 'ครีเอเตอร์', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/5/52/Twemoji12_1f4f9.svg', 5),
  ('stream', 'สตรีม', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/2/21/YouTube_icon_%282011-2013%29.svg', 6),
  ('hashtag', 'แฮชแท็ก', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Twemoji12_23-20e3.svg', 7),
  ('comment', 'คอมเมนต์', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/f/f2/OOjs_UI_icon_speechBubble-ltr-progressive.svg', 8),
  ('follower', 'ผู้ติดตาม', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Twemoji12_1f465.svg', 9),
  ('viral', 'ไวรัล', 'Internet content', 'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f525.svg', 10),
  ('watch', 'ดู', 'Actions', 'https://upload.wikimedia.org/wikipedia/commons/b/b6/Twemoji12_1f440.svg', 11),
  ('share', 'แชร์', 'Actions', 'https://upload.wikimedia.org/wikipedia/commons/0/09/OOjs_UI_icon_share-progressive.svg', 12),
  ('follow', 'ติดตาม', 'Actions', 'https://upload.wikimedia.org/wikipedia/commons/b/b3/Twemoji12_1f464.svg', 13),
  ('post', 'โพสต์', 'Actions', 'https://upload.wikimedia.org/wikipedia/commons/0/09/OOjs_UI_icon_share-progressive.svg', 14),
  ('react', 'รีแอค', 'Actions', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg', 15),
  ('create', 'สร้าง', 'Actions', 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Twemoji_270f.svg', 16),
  ('funny', 'ตลก', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg', 17),
  ('weird', 'แปลก', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/d/d1/Twemoji12_1f914.svg', 18),
  ('cool', 'เท่', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_1f60e.svg', 19),
  ('boring', 'น่าเบื่อ', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/4/40/Twemoji12_1f634.svg', 20),
  ('interesting', 'น่าสนใจ', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/8/84/Light_bulb_icon_red.svg', 21),
  ('popular', 'เป็นที่นิยม', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/9/99/OOjs_UI_icon_star.svg', 22)
) AS v(word, thai, category, image_url, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 2;

-- Picture match (activity 3) — emoji-style icons
INSERT INTO student_vocabulary_items (activity_id, english_word, image_url, sort_order)
SELECT la.id, v.word, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('meme', 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg', 1),
  ('hashtag', 'https://upload.wikimedia.org/wikipedia/commons/e/e3/Twemoji12_23-20e3.svg', 2),
  ('video', 'https://upload.wikimedia.org/wikipedia/commons/0/09/YouTube_full-color_icon_%282017%29.svg', 3),
  ('viral', 'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f525.svg', 4)
) AS v(word, image_url, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 3;

-- Categorize (activity 5)
INSERT INTO student_vocabulary_items (activity_id, english_word, category, sort_order)
SELECT la.id, v.word, v.category, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('creator', 'People', 1),
  ('follower', 'People', 2),
  ('watch', 'Actions', 3),
  ('post', 'Actions', 4),
  ('react', 'Actions', 5),
  ('share', 'Actions', 6),
  ('meme', 'Content', 7),
  ('trend', 'Content', 8),
  ('video', 'Content', 9)
) AS v(word, category, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 5;

-- Grammar drag order (activity 8)
INSERT INTO student_grammar_items (activity_id, item_kind, correct_sentence, words_array, sort_order)
SELECT la.id, 'drag_order', v.correct_sentence, v.words_array::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('I think memes are funny.', '["funny", "memes", "are", "I", "think"]', 1),
  ('I like videos because they are interesting.', '["like", "because", "I", "videos", "interesting", "they", "are"]', 2)
) AS v(correct_sentence, words_array, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 8;

-- Grammar MCQ (activity 9)
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, options, sort_order)
SELECT la.id, 'mcq', v.prompt, v.correct, v.options::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('I ____ memes every day.', 'watch', '{"choices": ["watch", "watches", "watching"], "correct": "watch"}', 1),
  ('I think this trend _____ strange.', 'is', '{"choices": ["is", "are", "am"], "correct": "is"}', 2)
) AS v(prompt, correct, options, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 9;

-- Grammar MCQ (activity 10) — 2-step: think + exciting
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, options, sort_order)
SELECT la.id, 'mcq', v.prompt, v.correct, v.options::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    'I think TikTok videos are _____.',
    'exciting',
    '{"choices": ["excited", "exciting", "excitement"], "correct": "exciting"}',
    1
  ),
  (
    'I ____ TikTok videos are exciting.',
    'think',
    '{"choices": ["think", "thinks", "thinking"], "correct": "think"}',
    2
  )
) AS v(prompt, correct, options, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 10;

-- Error fix (activity 11)
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, sort_order)
SELECT la.id, 'error_correction', v.wrong, v.fixed, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('I think memes funny.', 'I think memes are funny.', 1),
  ('I likes short videos.', 'I like short videos.', 2)
) AS v(wrong, fixed, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 11;

-- Mid-lesson polls 2–4 (activity 12)
INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, sort_order)
SELECT la.id, v.question, v.options::jsonb, FALSE, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    'What is your favorite meme?',
    '[{"id": "skibidi", "label": "Skibidi"}, {"id": "67", "label": "6-7"}, {"id": "chungus", "label": "Big Chungus"}, {"id": "brainrot", "label": "Brainrot"}]',
    1
  ),
  (
    'Do you like to create videos online?',
    '[{"id": "yes", "label": "Yes"}, {"id": "no", "label": "No"}, {"id": "unsure", "label": "Not sure"}]',
    2
  ),
  (
    'Which would be harder to stop using?',
    '[{"id": "youtube", "label": "YouTube"}, {"id": "games", "label": "Games"}, {"id": "music", "label": "Music"}, {"id": "social", "label": "Social media"}]',
    3
  )
) AS v(question, options, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 12;

-- Exit ticket: emoji → feeling (activity 15)
INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, correct_option_id, sort_order)
SELECT la.id, v.question, v.options::jsonb, FALSE, v.correct_id, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    '😀',
    '[{"id": "angry", "label": "Angry"}, {"id": "happy", "label": "Happy"}, {"id": "scared", "label": "Scared"}, {"id": "tired", "label": "Tired"}]',
    'happy',
    1
  ),
  (
    '😴',
    '[{"id": "excited", "label": "Excited"}, {"id": "sad", "label": "Sad"}, {"id": "tired", "label": "Tired"}, {"id": "surprised", "label": "Surprised"}]',
    'tired',
    2
  ),
  (
    '😡',
    '[{"id": "angry", "label": "Angry"}, {"id": "happy", "label": "Happy"}, {"id": "nervous", "label": "Nervous"}, {"id": "bored", "label": "Bored"}]',
    'angry',
    3
  ),
  (
    '😱',
    '[{"id": "relaxed", "label": "Relaxed"}, {"id": "hungry", "label": "Hungry"}, {"id": "scared", "label": "Scared"}, {"id": "funny", "label": "Funny"}]',
    'scared',
    4
  ),
  (
    '🤩',
    '[{"id": "excited", "label": "Excited"}, {"id": "sick", "label": "Sick"}, {"id": "sleepy", "label": "Sleepy"}, {"id": "lonely", "label": "Lonely"}]',
    'excited',
    5
  )
) AS v(question, options, correct_id, sort_order)
WHERE sl.slug = 'meme-culture-internet-trends' AND la.activity_order = 15;

COMMIT;

-- SELECT lesson_number, topic, active FROM student_lessons WHERE slug = 'meme-culture-internet-trends';
-- SELECT activity_order, activity_type, title FROM student_lesson_activities la
--   JOIN student_lessons sl ON sl.id = la.student_lesson_id
--   WHERE sl.slug = 'meme-culture-internet-trends' ORDER BY 1;
