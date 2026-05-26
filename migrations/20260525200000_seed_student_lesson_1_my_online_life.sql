-- Lesson 1: My Online Life — student track content seed
-- Prerequisite: 20260525100000_student_track_tables_and_roster.sql
-- Safe to re-run: deletes lesson by slug then re-inserts (CASCADE).

BEGIN;

DELETE FROM student_lessons WHERE slug = 'my-online-life';

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
  1,
  'My Online Life',
  'my-online-life',
  30,
  'Practice speaking about online life.',
  $gf${
    "simple_present": {
      "structure": "Subject + verb + object",
      "examples": [
        "I play games.",
        "I watch videos.",
        "I use YouTube.",
        "I chat with friends."
      ]
    },
    "frequency_adverbs": {
      "structure": "Subject + frequency + verb",
      "examples": [
        "I always listen to music.",
        "I usually play games.",
        "I sometimes watch videos.",
        "I never post videos."
      ],
      "ladder": ["Always", "Usually", "Sometimes", "Rarely", "Never"]
    },
    "like_dislike": {
      "examples": [
        "I like YouTube because it is interesting.",
        "I don't like TikTok because it is boring.",
        "I like games because they are fun."
      ]
    },
    "question_forms": {
      "examples": [
        "What app do you use?",
        "How many hours are you online?",
        "Do you play games?",
        "What do you watch?"
      ]
    }
  }$gf$::jsonb,
  $vl$[
    {"category": "Apps and technology", "words": ["app", "website", "phone", "tablet", "computer", "internet"]},
    {"category": "Online activities", "words": ["chat", "message", "call", "watch videos", "play games", "listen to music", "stream", "post", "search", "scroll", "download", "upload"]},
    {"category": "Opinion words", "words": ["fun", "boring", "interesting", "useful", "funny", "exciting"]}
  ]$vl$::jsonb,
  TRUE,
  1
);

-- Helper: all activity inserts reference lesson by slug
INSERT INTO student_lesson_activities (student_lesson_id, activity_type, activity_order, title, description, content)
SELECT sl.id, v.activity_type, v.activity_order, v.title, v.description, v.content::jsonb
FROM student_lessons sl
CROSS JOIN (VALUES
  (1, 'student_warmup_poll', 'Warmup: Hours online', 'How many hours are you online each day?', '{}'),
  (2, 'student_vocabulary_intro', 'Learn: Online vocabulary', 'Study these words before the games.', '{"group_by_category": true, "show_thai": false, "study_seconds": 60}'),
  (3, 'student_vocab_picture_match', 'Match: Picture → word', 'Tap a picture, then tap the matching word (or tap a word, then tap the picture).', '{}'),
  (4, 'student_vocab_missing_letters', 'Spell: Missing letters', 'Type the full word or phrase.', '{"sentences": [{"template": "pl__ g__es", "answer": "play games"}, {"template": "wa__h vid__s", "answer": "watch videos"}, {"template": "mes__ge", "answer": "message"}, {"template": "scr__ll", "answer": "scroll"}]}'),
  (5, 'student_vocab_categorize', 'Sort: Word categories', 'Tap a word, then tap its category. Or drag a word and drop it on a category box.', '{"buckets": ["Apps/Devices", "Activities", "Opinions"]}'),
  (6, 'student_vocab_speed_tap', 'Speed: Activity words', 'Select all activity words (no distractors), then tap Continue.', '{"targets": ["play games", "scroll", "upload", "message"], "distractors": ["interesting", "phone"]}'),
  (7, 'student_grammar_builder', 'Grammar: Rules', 'Read the rules, then practice.', '{}'),
  (8, 'student_grammar_drag_order', 'Practice: Sentence order', 'Put the words in the correct order.', '{}'),
  (9, 'student_grammar_mcq', 'Practice: Choose answer', 'Pick the correct word.', '{}'),
  (10, 'student_grammar_frequency', 'Practice: Frequency words', 'Choose the best frequency word.', '{}'),
  (11, 'student_grammar_complete', 'Practice: Complete the sentence', 'Choose an app and a reason to complete the sentence.', '{"template": "My favorite app is {app} because {reason}.", "apps": ["Instagram", "TikTok", "Facebook", "YouTube"], "reasons": ["I can watch videos", "I can chat with friends", "it is fun", "I learn new things"]}'),
  (12, 'student_grammar_error_fix', 'Practice: Fix the mistake', 'Write the correct sentence.', '{}'),
  (13, 'student_grammar_make_question', 'Practice: Make a question', 'Put the words in order to make a question.', '{}'),
  (14, 'student_speaking_cards', 'Speaking: Practice questions', 'Answer each question out loud. AI will listen and give you feedback.', '{"prompts": ["What app you use the most and why do you like it?", "What games do you play on your computer or mobile phone and what do you like about them?", "Do you think children should spend a lot of time online? why?", "Is TikTok good or bad for you? explain why"]}'),
  (15, 'student_challenge_wheel', 'Challenge: 30-second speak', 'Spin the wheel and speak for 30 seconds.', '{"duration_seconds": 30, "prompts": ["My favorite app", "My screen time", "My online habits", "Apps I dislike", "Games I play", "What I do after school"]}'),
  (16, 'student_exit_poll', 'Exit ticket', 'Answer before you finish the lesson.', '{}')
) AS v(activity_order, activity_type, title, description, content)
WHERE sl.slug = 'my-online-life';

-- Poll 1 (warmup)
INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, sort_order)
SELECT la.id,
  'How many hours are you online?',
  '[{"id": "lt1", "label": "Less than 1"}, {"id": "1-2", "label": "1–2"}, {"id": "3-5", "label": "3–5"}, {"id": "6plus", "label": "6+"}]'::jsonb,
  FALSE,
  1
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE sl.slug = 'my-online-life' AND la.activity_order = 1;

-- Vocabulary intro (activity 2)
INSERT INTO student_vocabulary_items (activity_id, english_word, category, image_url, sort_order)
SELECT la.id, v.word, v.category, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('app', 'Apps and technology', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_advanced.svg', 1),
  ('website', 'Apps and technology', 'https://commons.wikimedia.org/wiki/Special:FilePath/Globe_icon.svg', 2),
  ('phone', 'Apps and technology', 'https://upload.wikimedia.org/wikipedia/commons/4/4a/Twemoji12_1f4f1.svg', 3),
  ('tablet', 'Apps and technology', 'https://upload.wikimedia.org/wikipedia/commons/8/89/Twemoji12_1f4fb.svg', 4),
  ('computer', 'Apps and technology', 'https://commons.wikimedia.org/wiki/Special:FilePath/Emoji_u1f4bb.svg', 5),
  ('internet', 'Apps and technology', 'https://commons.wikimedia.org/wiki/Special:FilePath/Wifi.svg', 6),
  ('chat', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_speechBubble-ltr-progressive.svg', 7),
  ('message', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_message-progressive.svg', 8),
  ('call', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/Telephone%20icon%20blue%20gradient.svg', 9),
  ('watch videos', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/YouTube%20full-color%20icon%20(2017).svg', 10),
  ('play games', 'Online activities', 'https://upload.wikimedia.org/wikipedia/commons/6/65/Twemoji12_1f3ae.svg', 11),
  ('listen to music', 'Online activities', 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Twemoji12_1f3a7.svg', 12),
  ('stream', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/Youtube%20icon.svg', 13),
  ('post', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_share-progressive.svg', 14),
  ('search', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_search-ltr-progressive.svg', 15),
  ('scroll', 'Online activities', 'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f4f2.svg', 16),
  ('download', 'Online activities', 'https://commons.wikimedia.org/wiki/Special:FilePath/Icon%20Download%20Black.svg', 17),
  ('upload', 'Online activities', 'https://upload.wikimedia.org/wikipedia/commons/e/e7/Twemoji12_1f4e4.svg', 18),
  ('fun', 'Opinion words', 'https://commons.wikimedia.org/wiki/Special:FilePath/Smiley.svg', 19),
  ('boring', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/4/40/Twemoji12_1f634.svg', 20),
  ('interesting', 'Opinion words', 'https://commons.wikimedia.org/wiki/Special:FilePath/Light%20bulb%20icon%20red.svg', 21),
  ('useful', 'Opinion words', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs%20UI%20icon%20check-constructive.svg', 22),
  ('funny', 'Opinion words', 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg', 23),
  ('exciting', 'Opinion words', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_star.svg', 24)
) AS v(word, category, image_url, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 2;

-- Picture match (activity 3) — 4 pairs only
INSERT INTO student_vocabulary_items (activity_id, english_word, image_url, sort_order)
SELECT la.id, v.word, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('play games', 'https://upload.wikimedia.org/wikipedia/commons/6/65/Twemoji12_1f3ae.svg', 1),
  ('listen to music', 'https://upload.wikimedia.org/wikipedia/commons/7/7f/Twemoji12_1f3a7.svg', 2),
  ('chat', 'https://commons.wikimedia.org/wiki/Special:FilePath/OOjs_UI_icon_speechBubble-ltr-progressive.svg', 3),
  ('stream', 'https://commons.wikimedia.org/wiki/Special:FilePath/Youtube%20icon.svg', 4)
) AS v(word, image_url, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 3;

-- Categorize (activity 5)
INSERT INTO student_vocabulary_items (activity_id, english_word, category, sort_order)
SELECT la.id, v.word, v.category, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('phone', 'Apps/Devices', 1),
  ('computer', 'Apps/Devices', 2),
  ('tablet', 'Apps/Devices', 3),
  ('play games', 'Activities', 4),
  ('stream', 'Activities', 5),
  ('message', 'Activities', 6),
  ('fun', 'Opinions', 7),
  ('boring', 'Opinions', 8),
  ('exciting', 'Opinions', 9)
) AS v(word, category, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 5;

-- Grammar drag order (activity 8)
INSERT INTO student_grammar_items (activity_id, item_kind, correct_sentence, words_array, sort_order)
SELECT la.id, 'drag_order', v.correct_sentence, v.words_array::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('I usually play games.', '["usually", "games", "I", "play"]', 1),
  ('I never post videos.', '["never", "videos", "post", "I"]', 2)
) AS v(correct_sentence, words_array, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 8;

-- Grammar MCQ (activity 9)
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, options, sort_order)
SELECT la.id, 'mcq', v.prompt, v.correct, v.options::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('I ___ games every day.', 'play', '{"choices": ["play", "plays", "playing"], "correct": "play"}', 1),
  ('I ___ usually watch videos.', '(blank)', '{"choices": ["am", "do", "(blank)"], "correct": "(blank)"}', 2)
) AS v(prompt, correct, options, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 9;

-- Frequency (activity 10)
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, options, sort_order)
SELECT la.id, 'frequency_select', v.prompt, v.correct_word,
  v.options::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('I _____ eat pizza every day.', 'always', '{"choices": ["always", "sometimes", "never"], "correct": "always"}', 1),
  ('I _____ use YouTube.', 'always', '{"choices": ["always", "sometimes", "never"], "correct": "always"}', 2)
) AS v(prompt, correct_word, options, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 10;

-- Error fix (activity 12)
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, sort_order)
SELECT la.id, 'error_correction', v.wrong, v.fixed, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('I usually playing games.', 'I usually play games.', 1),
  ('I use always YouTube.', 'I always use YouTube.', 2)
) AS v(wrong, fixed, sort_order)
WHERE sl.slug = 'my-online-life' AND la.activity_order = 12;

-- Make a question (activity 13)
INSERT INTO student_grammar_items (activity_id, item_kind, correct_sentence, words_array, sort_order)
SELECT la.id, 'make_question', 'What app do you use?', '["you", "use", "what app", "do"]'::jsonb, 1
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
WHERE sl.slug = 'my-online-life' AND la.activity_order = 13;

-- Exit ticket (activity 16) — 3 questions (Q1 replaced)
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

-- SELECT lesson_number, topic FROM student_lessons WHERE slug = 'my-online-life';
-- SELECT activity_order, activity_type, title FROM student_lesson_activities la
--   JOIN student_lessons sl ON sl.id = la.student_lesson_id WHERE sl.slug = 'my-online-life' ORDER BY 1;
