-- Lesson 3: Design Your Own Character — full lesson flow (~30 min)
-- Prerequisite: prior student lesson seeds. Starts INACTIVE.

BEGIN;

DELETE FROM student_lessons WHERE slug = 'design-your-own-character';

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
  3,
  'Design Your Own Character',
  'design-your-own-character',
  35,
  'Students design a character, describe appearance and personality, and write a short story.',
  $gf${
    "appearance": {
      "structure": "He/She has + noun/adjective. He/She wears + noun.",
      "examples": [
        "She has long hair.",
        "He has brown eyes.",
        "She wears a blue shirt."
      ]
    },
    "personality": {
      "structure": "He/She is + adjective",
      "examples": [
        "He is friendly.",
        "She is creative."
      ]
    },
    "story": {
      "structure": "Simple present sentences about the character's life",
      "examples": [
        "My character likes music.",
        "My character helps friends."
      ]
    }
  }$gf$::jsonb,
  $vl$[
    {"category": "Appearance", "words": ["tall", "short", "young", "hair", "eyes"]},
    {"category": "Clothes", "words": ["shirt", "pants", "shoes", "jacket", "dress"]},
    {"category": "Colors", "words": ["blue", "green", "brown", "black", "blond"]},
    {"category": "Personality", "words": ["friendly", "kind", "funny", "clever", "creative", "helpful", "serious", "quiet", "confident", "shy", "lazy", "rude", "selfish", "mean"]}
  ]$vl$::jsonb,
  FALSE,
  1
);

INSERT INTO student_lesson_activities (student_lesson_id, activity_type, activity_order, title, description, content, estimated_time_seconds)
SELECT sl.id, v.activity_type, v.activity_order, v.title, v.description, v.content::jsonb, v.estimated_time_seconds
FROM student_lessons sl
CROSS JOIN (VALUES
  (
    1,
    'student_character_builder',
    'Character Builder',
    'Use the character creator: pick skin, eyes, mouth, hair, top, bottom, shoes, features, and extra. Press Continue when finished.',
    '{}',
    360
  ),
  (
    2,
    'student_vocabulary_intro',
    'Appearance vocabulary',
    'Study appearance, clothes, and color words (about 4 minutes). Tap a word to see Thai.',
    '{"group_by_category": true, "show_thai": false, "tap_thai_translation": true, "study_seconds": 120}',
    240
  ),
  (
    3,
    'student_vocab_image_mcq',
    'Match: Image → word',
    'Look at the character picture. Choose the best word from the dropdown.',
    $mcq${
      "items": [
        {
          "image_url": "/characters/hair/thumb08.png",
          "prompt": "This character has ___ hair.",
          "choices": ["short", "long", "curly", "blue"],
          "correct": "short"
        },
        {
          "image_url": "/characters/eyes/thumb12.png",
          "prompt": "These eyes are ___.",
          "choices": ["green", "brown", "black", "blond"],
          "correct": "green"
        },
        {
          "image_url": "/characters/top/thumb17.png",
          "prompt": "This is a ___.",
          "choices": ["shirt", "pants", "shoes", "hair"],
          "correct": "shirt"
        },
        {
          "image_url": "/characters/mouth/thumb05.png",
          "prompt": "This mouth looks ___.",
          "choices": ["happy", "angry", "tall", "friendly"],
          "correct": "happy"
        }
      ]
    }$mcq$,
    240
  ),
  (
    4,
    'student_vocabulary_intro',
    'Personality vocabulary',
    'Study positive, negative, and neutral personality words (about 4 minutes). Tap a word to see Thai.',
    '{"group_by_category": true, "show_thai": false, "tap_thai_translation": true, "study_seconds": 120}',
    240
  ),
  (
    5,
    'student_grammar_mcq',
    'Choose the best word',
    'Pick the best personality word for each situation.',
    '{}',
    240
  ),
  (
    6,
    'student_character_description',
    'Character description builder',
    $desc$Appearance: She has long hair. / He has brown eyes. / She wears a blue shirt.
Personality: He is friendly. / She is creative.

Build three sentences about your character using the dropdowns.$desc$,
    $sent${
      "sentences": [
        {
          "template": "My character is {word}.",
          "slot_label": "Personality",
          "options": ["friendly", "kind", "funny", "clever", "quiet", "confident"]
        },
        {
          "template": "My character has {word} eyes.",
          "slot_label": "Eye color",
          "options": ["blue", "green", "brown", "dark"]
        },
        {
          "template": "My character likes to {word}.",
          "slot_label": "Hobby",
          "options": ["read books", "play sports", "draw pictures", "listen to music", "help friends"]
        }
      ]
    }$sent$,
    300
  ),
  (
    7,
    'student_character_story',
    'Character story',
    'Talk about your character. Answer each question out loud — AI will listen and give feedback.',
    $story${
      "source_activity_order": 1,
      "prompts": [
        "What makes your character special?",
        "What does your character look like?",
        "What is your character's personality?",
        "What does your character like to do?"
      ]
    }$story$,
    300
  ),
  (
    8,
    'student_challenge_wheel',
    'Speaking: Character wheel',
    'Spin the wheel and practice speaking for 30 seconds.',
    '{"duration_seconds": 30, "prompts": ["Describe your character''s appearance.", "What is your character''s personality?", "What does your character like doing?", "Would you be friends with your character? Why?"]}',
    300
  ),
  (
    9,
    'student_exit_poll',
    'Exit ticket: Picture → word',
    'Match each picture to the correct word before you finish the lesson.',
    '{}',
    180
  )
) AS v(activity_order, activity_type, title, description, content, estimated_time_seconds)
WHERE sl.slug = 'design-your-own-character';

-- Appearance vocabulary (activity 2)
INSERT INTO student_vocabulary_items (activity_id, english_word, thai_translation, category, image_url, sort_order)
SELECT la.id, v.word, v.thai, v.category, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('tall', 'สูง', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Yao_Ming.jpg', 1),
  ('short', 'เตี้ย', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/4/47/Little_girl.jpg', 2),
  ('young', 'อายุน้อย', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/b/b0/A_young_boy_smiling.jpg', 3),
  ('hair', 'ผม', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/7/75/Long_hair.jpg', 4),
  ('eyes', 'ตา', 'Appearance', 'https://upload.wikimedia.org/wikipedia/commons/d/d2/Woman_eyes_close-up.jpg', 5),
  ('shirt', 'เสื้อ', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/0/09/T-shirt.jpg', 6),
  ('pants', 'กางเกง', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/5/5a/Jeans.jpg', 7),
  ('shoes', 'รองเท้า', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/a/a7/Running_shoes.jpg', 8),
  ('jacket', 'แจ็กเกット', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/9/93/Leather_jacket.jpg', 9),
  ('dress', 'ชุดเดรส', 'Clothes', 'https://upload.wikimedia.org/wikipedia/commons/6/63/Dress.jpg', 10),
  ('blue', 'สีน้ำเงิน', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/d/d7/Sky.jpg', 11),
  ('green', 'สีเขียว', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Green_leaves.jpg', 12),
  ('brown', 'สีน้ำตาล', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/1/1f/Wood.jpg', 13),
  ('black', 'สีดำ', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/5/50/Black_colour.jpg', 14),
  ('blond', 'สีบลอนด์', 'Colors', 'https://upload.wikimedia.org/wikipedia/commons/f/f9/Blonde_hair.jpg', 15)
) AS v(word, thai, category, image_url, sort_order)
WHERE sl.slug = 'design-your-own-character' AND la.activity_order = 2;

-- Personality vocabulary (activity 4)
INSERT INTO student_vocabulary_items (activity_id, english_word, thai_translation, category, image_url, sort_order)
SELECT la.id, v.word, v.thai, v.category, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('friendly', 'เป็นมิตร', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Twemoji12_1f91d.svg', 1),
  ('kind', 'ใจดี', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg', 2),
  ('funny', 'ตลก', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg', 3),
  ('clever', 'ฉลาด', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/8/84/Light_bulb_icon_red.svg', 4),
  ('creative', 'สร้างสรรค์', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/f/f4/Twemoji_270f.svg', 5),
  ('helpful', 'ช่วยเหลือ', 'Positive', 'https://upload.wikimedia.org/wikipedia/commons/7/78/Twemoji12_1f64c.svg', 6),
  ('serious', 'จริงจัง', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/c/cf/Twemoji12_1f610.svg', 7),
  ('quiet', 'เงียบ', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/2/22/Twemoji12_1f92b.svg', 8),
  ('confident', 'มั่นใจ', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_1f60e.svg', 9),
  ('shy', 'ขี้อาย', 'Neutral', 'https://upload.wikimedia.org/wikipedia/commons/a/a0/Twemoji12_1f633.svg', 10),
  ('lazy', 'ขี้เกียจ', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/4/40/Twemoji12_1f634.svg', 11),
  ('rude', 'ไม่สุภาพ', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Twemoji12_1f621.svg', 12),
  ('selfish', 'เห็นแก่ตัว', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Twemoji_1f4b0.svg', 13),
  ('mean', 'ใจร้าย', 'Negative', 'https://upload.wikimedia.org/wikipedia/commons/e/ec/Twemoji12_1f624.svg', 14)
) AS v(word, thai, category, image_url, sort_order)
WHERE sl.slug = 'design-your-own-character' AND la.activity_order = 4;

-- Personality MCQ (activity 5)
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, options, sort_order)
SELECT la.id, 'mcq', v.prompt, v.correct, v.options::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    'A person helps everyone.',
    'kind',
    '{"choices": ["brave", "kind", "lazy", "rude"], "correct": "kind"}',
    1
  ),
  (
    'A person makes people laugh.',
    'funny',
    '{"choices": ["funny", "selfish", "serious", "quiet"], "correct": "funny"}',
    2
  )
) AS v(prompt, correct, options, sort_order)
WHERE sl.slug = 'design-your-own-character' AND la.activity_order = 5;

-- Exit ticket: picture → word (activity 9)
INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, correct_option_id, sort_order)
SELECT la.id, v.question, v.options::jsonb, FALSE, v.correct_id, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    'https://upload.wikimedia.org/wikipedia/commons/3/3e/Twemoji12_1f91d.svg',
    '[{"id": "friendly", "label": "friendly"}, {"id": "shirt", "label": "shirt"}, {"id": "lazy", "label": "lazy"}, {"id": "tall", "label": "tall"}]',
    'friendly',
    1
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/0/09/T-shirt.jpg',
    '[{"id": "shirt", "label": "shirt"}, {"id": "pants", "label": "pants"}, {"id": "dress", "label": "dress"}, {"id": "jacket", "label": "jacket"}]',
    'shirt',
    2
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/7/75/Long_hair.jpg',
    '[{"id": "hair", "label": "hair"}, {"id": "eyes", "label": "eyes"}, {"id": "young", "label": "young"}, {"id": "blond", "label": "blond"}]',
    'hair',
    3
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg',
    '[{"id": "kind", "label": "kind"}, {"id": "mean", "label": "mean"}, {"id": "rude", "label": "rude"}, {"id": "selfish", "label": "selfish"}]',
    'kind',
    4
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/c/c8/Twemoji12_1f606.svg',
    '[{"id": "funny", "label": "funny"}, {"id": "serious", "label": "serious"}, {"id": "quiet", "label": "quiet"}, {"id": "shy", "label": "shy"}]',
    'funny',
    5
  )
) AS v(question, options, correct_id, sort_order)
WHERE sl.slug = 'design-your-own-character' AND la.activity_order = 9;

COMMIT;
