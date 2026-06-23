-- Lesson 4: Create Your Superhero — student track content seed
-- Slug: create-your-superhero ONLY (does not touch lessons 1–3)
-- Safe to re-run: DELETE by slug then re-insert (CASCADE).
-- Starts INACTIVE — admin enables when ready.

BEGIN;

DELETE FROM student_lessons WHERE slug = 'create-your-superhero';

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
  4,
  'Create Your Superhero',
  'create-your-superhero',
  60,
  'Describe powers and personality; explain hero vs villain choices.',
  $gf${
    "abilities": {
      "structure": "Subject + can / can't + verb",
      "examples": [
        "She can fly.",
        "He can't read minds.",
        "They can run fast."
      ]
    },
    "is_able_to": {
      "structure": "Subject + is / are + (not) able to + verb",
      "examples": [
        "She is able to control fire.",
        "He is not able to turn invisible.",
        "We are able to team up."
      ]
    },
    "comparison": {
      "structure": "adjective-er + than / more + adjective + than",
      "examples": [
        "She is faster than him.",
        "My hero is stronger than a normal person.",
        "Villains are more dangerous than heroes."
      ]
    },
    "character": {
      "structure": "He/She is + adjective. He/She wants to + verb.",
      "examples": [
        "She is brave.",
        "He wants to save the city.",
        "My hero is loyal."
      ]
    }
  }$gf$::jsonb,
  $vl$[
    {"category": "Powers", "words": ["fly", "run fast", "jump high", "read minds", "control fire", "turn invisible", "super strength", "teleport", "freeze things", "see the future", "heal people", "shoot lasers"]},
    {"category": "Hero traits", "words": ["brave", "honest", "helpful", "protective", "loyal", "kind", "selfless"]},
    {"category": "Villain traits", "words": ["selfish", "cruel", "greedy", "sneaky", "jealous", "evil", "dangerous"]},
    {"category": "Gear and look", "words": ["cape", "mask", "armor", "boots", "glowing eyes", "claws", "shield", "helmet"]},
    {"category": "Story", "words": ["save the city", "steal", "trick", "fight", "hide", "team up"]}
  ]$vl$::jsonb,
  FALSE,
  1
);

-- Activities 1–17
INSERT INTO student_lesson_activities (student_lesson_id, activity_type, activity_order, title, description, content, estimated_time_seconds)
SELECT sl.id, v.activity_type, v.activity_order, v.title, v.description, v.content::jsonb, v.estimated_time_seconds
FROM student_lessons sl
CROSS JOIN (VALUES
  (
    1,
    'student_speaking_cards',
    'Warmup: Heroes vs villains',
    'Answer each question out loud. AI will listen and give you feedback.',
    $sp1${"prompts": ["What is the difference between a superhero and a supervillain?", "Who is cooler — heroes or villains? Why?"]}$sp1$,
    240
  ),
  (
    2,
    'student_vocabulary_intro',
    'Learn: Superpowers',
    'Study superhero vocabulary (about 3 minutes). Tap a word to see Thai.',
    '{"group_by_category": true, "show_thai": false, "tap_thai_translation": true, "study_seconds": 180}'::text,
    240
  ),
  (
    3,
    'student_vocab_picture_match',
    'Match: Power → picture',
    'Tap a picture, then tap the matching word.',
    '{}'::text,
    180
  ),
  (
    4,
    'student_vocab_missing_letters',
    'Spell: Powers',
    'Type the full word or phrase.',
    $ml${"sentences": [{"template": "fl__", "answer": "fly"}, {"template": "t__n inv__ible", "answer": "turn invisible"}, {"template": "sup__ str__ngth", "answer": "super strength"}, {"template": "c__trol f__e", "answer": "control fire"}, {"template": "t__eport", "answer": "teleport"}, {"template": "r__d m__ds", "answer": "read minds"}]}$ml$,
    180
  ),
  (
    5,
    'student_vocab_categorize',
    'Sort: Hero trait vs villain trait',
    'Tap a word, then tap its category. Words are shuffled.',
    '{"buckets": ["Hero trait", "Villain trait"]}'::text,
    180
  ),
  (
    6,
    'student_vocab_speed_tap',
    'Speed: Power words',
    'Tap all power words, then press Continue.',
    $st${"targets": ["fly", "teleport", "read minds", "super strength"], "distractors": ["cape", "brave", "selfish", "save the city", "mask", "honest"]}$st$,
    120
  ),
  (
    7,
    'student_superhero_builder',
    'Which hero are you?',
    'Answer 10 questions. We will show which hero you are most like — and why.',
    '{}'::text,
    300
  ),
  (
    8,
    'student_grammar_builder',
    'Grammar: can / can''t',
    'Read the rules, then practice in the next activity.',
    '{"study_seconds": 90}'::text,
    90
  ),
  (
    9,
    'student_grammar_mcq',
    'Practice: Abilities',
    'Pick the correct word.',
    '{}'::text,
    240
  ),
  (
    10,
    'student_grammar_drag_order',
    'Compare: stronger / faster',
    'Put the words in the correct order.',
    '{}'::text,
    240
  ),
  (
    11,
    'student_superhero_profile',
    'Powers & weakness sentences',
    'Build five sentences about your hero using the dropdowns.',
    $prof${
      "sentences": [
        {
          "template": "My hero can {word}.",
          "slot_label": "Power",
          "options": ["fly", "run fast", "read minds", "control fire", "turn invisible", "super strength", "teleport", "heal people"]
        },
        {
          "template": "My hero can't {word}.",
          "slot_label": "Weakness / limit",
          "options": ["read minds", "fly", "turn invisible", "control fire", "teleport", "shoot lasers"]
        },
        {
          "template": "My hero is {word}.",
          "slot_label": "Trait",
          "options": ["brave", "honest", "helpful", "loyal", "kind", "selfish", "cruel", "sneaky"]
        },
        {
          "template": "My hero wants to {word}.",
          "slot_label": "Goal",
          "options": ["save the city", "team up", "fight", "hide", "steal", "trick"]
        },
        {
          "template": "My hero is {word} than a normal person.",
          "slot_label": "Comparison",
          "options": ["stronger", "faster", "more dangerous"]
        }
      ]
    }$prof$,
    300
  ),
  (
    12,
    'student_speaking_cards',
    'Moral choices: What would you do?',
    'Answer each scenario out loud. AI will listen and give you feedback.',
    $sp12${"prompts": ["A villain steals a wallet on the street. What would you do?", "Your friend asks you to cheat on a test. What would you do?", "You find a lost phone and nobody is around. What would you do?"]}$sp12$,
    360
  ),
  (
    13,
    'student_speaking_cards',
    'Origin story',
    'Tell your hero''s origin story. Answer each question out loud.',
    $sp13${"prompts": ["What is your hero's name?", "What powers does your hero have?", "Is your hero a hero or a villain? Why?", "Tell one short story about your hero."]}$sp13$,
    300
  ),
  (
    14,
    'student_alignment_reveal',
    'Are you a hero or a villain?',
    'The Magic Hat will decide your fate.',
    $al${"demo_alignment": "hero", "demo_reason": "You help people and make kind choices. Your answers sound like a hero!"}$al$,
    180
  ),
  (
    15,
    'student_superhero_image_generate',
    'What would you be like as a superhero based on your answers and appearance?',
    'The Magic Hat will generate your superhero portrait based on your choices.',
    '{}'::text,
    300
  ),
  (
    16,
    'student_challenge_wheel',
    'Power wheel 30s',
    'Spin the wheel and practice speaking for 30 seconds.',
    $wh${"duration_seconds": 30, "prompts": ["My hero's best power", "My hero vs a villain", "A day in my hero's life", "Why my hero is special"]}$wh$,
    300
  ),
  (
    17,
    'student_exit_poll',
    'Exit: picture → word',
    'Match each picture to the correct word before you finish.',
    '{}'::text,
    180
  )
) AS v(activity_order, activity_type, title, description, content, estimated_time_seconds)
WHERE sl.slug = 'create-your-superhero';

-- Vocabulary intro (activity 2) — 40 words
INSERT INTO student_vocabulary_items (activity_id, english_word, thai_translation, category, image_url, sort_order)
SELECT la.id, v.word, v.thai, v.category, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('fly', 'บิน', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Twemoji12_1f985.svg', 1),
  ('run fast', 'วิ่งเร็ว', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_1f3c3-200d-2642-fe0f.svg', 2),
  ('jump high', 'กระโดดสูง', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/1/16/Twemoji12_1f938-200d-2640-fe0f.svg', 3),
  ('read minds', 'อ่านความคิด', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Twemoji12_1f9e0.svg', 4),
  ('control fire', 'ควบคุมไฟ', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f525.svg', 5),
  ('turn invisible', 'ล่องหน', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/6/66/Twemoji12_1f47b.svg', 6),
  ('super strength', 'พลังมหาศาล', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/a/af/Twemoji12_1f4aa.svg', 7),
  ('teleport', 'วาร์ป', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/3/3d/Twemoji12_2728.svg', 8),
  ('freeze things', 'แช่แข็ง', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/d/db/Twemoji12_2744.svg', 9),
  ('see the future', 'มองเห็นอนาคต', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/3/3c/Twemoji12_1f52e.svg', 10),
  ('heal people', 'รักษาคน', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/4/41/Twemoji12_1fa79.svg', 11),
  ('shoot lasers', 'ยิงเลเซอร์', 'Powers', 'https://upload.wikimedia.org/wikipedia/commons/1/19/Twemoji12_26a1.svg', 12),
  ('brave', 'กล้าหาญ', 'Hero traits', 'https://upload.wikimedia.org/wikipedia/commons/0/03/Twemoji12_1f981.svg', 13),
  ('honest', 'ซื่อสัตย์', 'Hero traits', 'https://upload.wikimedia.org/wikipedia/commons/7/7b/Twemoji12_2696.svg', 14),
  ('helpful', 'ช่วยเหลือ', 'Hero traits', 'https://upload.wikimedia.org/wikipedia/commons/7/78/Twemoji12_1f64c.svg', 15),
  ('protective', 'ปกป้อง', 'Hero traits', 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Twemoji12_1f6e1.svg', 16),
  ('loyal', 'ซื่อสัตย์ต่อเพื่อน', 'Hero traits', 'https://upload.wikimedia.org/wikipedia/commons/3/3e/Twemoji12_1f91d.svg', 17),
  ('kind', 'ใจดี', 'Hero traits', 'https://upload.wikimedia.org/wikipedia/commons/8/82/Twemoji12_2764.svg', 18),
  ('selfless', 'ไม่เห็นแก่ตัว', 'Hero traits', 'https://upload.wikimedia.org/wikipedia/commons/4/42/Twemoji12_1f381.svg', 19),
  ('selfish', 'เห็นแก่ตัว', 'Villain traits', 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Twemoji_1f4b0.svg', 20),
  ('cruel', 'โหดร้าย', 'Villain traits', 'https://upload.wikimedia.org/wikipedia/commons/f/f0/Twemoji12_1f621.svg', 21),
  ('greedy', 'โลภ', 'Villain traits', 'https://upload.wikimedia.org/wikipedia/commons/c/ce/Twemoji12_1f911.svg', 22),
  ('sneaky', 'แอบแฝง', 'Villain traits', 'https://upload.wikimedia.org/wikipedia/commons/2/22/Twemoji12_1f92b.svg', 23),
  ('jealous', 'อิจฉา', 'Villain traits', 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Twemoji12_1f47f.svg', 24),
  ('evil', 'ชั่วร้าย', 'Villain traits', 'https://upload.wikimedia.org/wikipedia/commons/5/5e/Twemoji12_1f480.svg', 25),
  ('dangerous', 'อันตราย', 'Villain traits', 'https://upload.wikimedia.org/wikipedia/commons/f/ff/Warning_Emoji.svg', 26),
  ('cape', 'ผ้าคลุม', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/3/3f/Superhero.svg', 27),
  ('mask', 'หน้ากาก', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/0/08/Twemoji12_1f3ad.svg', 28),
  ('armor', 'เกราะ', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/d/dc/Wikipe-tan_knight.svg', 29),
  ('boots', 'รองเท้าบูท', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/c/c6/Twemoji12_1f462.svg', 30),
  ('glowing eyes', 'ตาเรืองแสง', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/7/76/Twemoji12_1f929.svg', 31),
  ('claws', 'กรงเล็บ', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/6/66/Twemoji12_1f43a.svg', 32),
  ('shield', 'โล่', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/f/f2/Twemoji12_1f6e1.svg', 33),
  ('helmet', 'หมวกกันน็อ', 'Gear and look', 'https://upload.wikimedia.org/wikipedia/commons/e/eb/Twemoji12_26d1.svg', 34),
  ('save the city', 'ช่วยเมือง', 'Story', 'https://upload.wikimedia.org/wikipedia/commons/8/8f/Twemoji12_1f3d9.svg', 35),
  ('steal', 'ขโมย', 'Story', 'https://upload.wikimedia.org/wikipedia/commons/c/cf/Twemoji12_1f45b.svg', 36),
  ('trick', 'หลอกลวง', 'Story', 'https://upload.wikimedia.org/wikipedia/commons/b/b8/Twemoji12_1f0cf.svg', 37),
  ('fight', 'ต่อสู้', 'Story', 'https://upload.wikimedia.org/wikipedia/commons/0/07/Twemoji12_1f94a.svg', 38),
  ('hide', 'ซ่อนตัว', 'Story', 'https://upload.wikimedia.org/wikipedia/commons/e/ea/Twemoji12_1f648.svg', 39),
  ('team up', 'ร่วมมือ', 'Story', 'https://upload.wikimedia.org/wikipedia/commons/8/8c/Twemoji12_1f465.svg', 40)
) AS v(word, thai, category, image_url, sort_order)
WHERE sl.slug = 'create-your-superhero' AND la.activity_order = 2;

-- Picture match (activity 3)
INSERT INTO student_vocabulary_items (activity_id, english_word, image_url, sort_order)
SELECT la.id, v.word, v.image_url, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('fly', 'https://upload.wikimedia.org/wikipedia/commons/e/e1/Twemoji12_1f985.svg', 1),
  ('control fire', 'https://upload.wikimedia.org/wikipedia/commons/9/98/Twemoji12_1f525.svg', 2),
  ('turn invisible', 'https://upload.wikimedia.org/wikipedia/commons/6/66/Twemoji12_1f47b.svg', 3),
  ('super strength', 'https://upload.wikimedia.org/wikipedia/commons/a/af/Twemoji12_1f4aa.svg', 4)
) AS v(word, image_url, sort_order)
WHERE sl.slug = 'create-your-superhero' AND la.activity_order = 3;

-- Categorize (activity 5)
INSERT INTO student_vocabulary_items (activity_id, english_word, category, sort_order)
SELECT la.id, v.word, v.category, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('brave', 'Hero trait', 1),
  ('honest', 'Hero trait', 2),
  ('helpful', 'Hero trait', 3),
  ('loyal', 'Hero trait', 4),
  ('kind', 'Hero trait', 5),
  ('selfish', 'Villain trait', 6),
  ('cruel', 'Villain trait', 7),
  ('greedy', 'Villain trait', 8),
  ('sneaky', 'Villain trait', 9),
  ('jealous', 'Villain trait', 10)
) AS v(word, category, sort_order)
WHERE sl.slug = 'create-your-superhero' AND la.activity_order = 5;

-- Grammar MCQ (activity 9)
INSERT INTO student_grammar_items (activity_id, item_kind, original_sentence, correct_sentence, options, sort_order)
SELECT la.id, 'mcq', v.prompt, v.correct, v.options::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('My hero ___ fly.', 'can', '{"choices": ["can", "can''t not", "cans"], "correct": "can"}', 1),
  ('A normal person ___ read minds.', 'can''t', '{"choices": ["can", "can''t", "is"], "correct": "can''t"}', 2),
  ('She ___ able to run fast.', 'is', '{"choices": ["is", "are", "am"], "correct": "is"}', 3),
  ('He ___ turn invisible. He is too weak.', 'can''t', '{"choices": ["can", "can''t", "doesn''t"], "correct": "can''t"}', 4)
) AS v(prompt, correct, options, sort_order)
WHERE sl.slug = 'create-your-superhero' AND la.activity_order = 9;

-- Grammar drag order (activity 10)
INSERT INTO student_grammar_items (activity_id, item_kind, correct_sentence, words_array, sort_order)
SELECT la.id, 'drag_order', v.correct_sentence, v.words_array::jsonb, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  ('She is faster than him.', '["faster", "She", "than", "is", "him"]', 1),
  ('My hero is stronger than a normal person.', '["stronger", "My", "hero", "is", "than", "a", "normal", "person"]', 2),
  ('Villains are more dangerous than heroes.', '["more", "Villains", "dangerous", "are", "than", "heroes"]', 3),
  ('This power is more useful than teleport.', '["more", "This", "power", "is", "useful", "than", "teleport"]', 4)
) AS v(correct_sentence, words_array, sort_order)
WHERE sl.slug = 'create-your-superhero' AND la.activity_order = 10;

-- Exit ticket (activity 17)
INSERT INTO student_poll_items (activity_id, question, options, allow_multiple, correct_option_id, sort_order)
SELECT la.id, v.question, v.options::jsonb, FALSE, v.correct_id, v.sort_order
FROM student_lesson_activities la
JOIN student_lessons sl ON sl.id = la.student_lesson_id
CROSS JOIN (VALUES
  (
    'https://upload.wikimedia.org/wikipedia/commons/e/e1/Twemoji12_1f985.svg',
    '[{"id": "fly", "label": "fly"}, {"id": "fire", "label": "fire"}, {"id": "ghost", "label": "ghost"}, {"id": "strength", "label": "strength"}]',
    'fly',
    1
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/0/03/Twemoji12_1f981.svg',
    '[{"id": "brave", "label": "brave"}, {"id": "selfish", "label": "selfish"}, {"id": "sneaky", "label": "sneaky"}, {"id": "cruel", "label": "cruel"}]',
    'brave',
    2
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/b/bb/Twemoji_1f4b0.svg',
    '[{"id": "kind", "label": "kind"}, {"id": "selfish", "label": "selfish"}, {"id": "loyal", "label": "loyal"}, {"id": "honest", "label": "honest"}]',
    'selfish',
    3
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/3/3f/Superhero.svg',
    '[{"id": "mask", "label": "mask"}, {"id": "cape", "label": "cape"}, {"id": "armor", "label": "armor"}, {"id": "boots", "label": "boots"}]',
    'cape',
    4
  ),
  (
    'https://upload.wikimedia.org/wikipedia/commons/0/07/Twemoji12_1f94a.svg',
    '[{"id": "hide", "label": "hide"}, {"id": "trick", "label": "trick"}, {"id": "fight", "label": "fight"}, {"id": "steal", "label": "steal"}]',
    'fight',
    5
  )
) AS v(question, options, correct_id, sort_order)
WHERE sl.slug = 'create-your-superhero' AND la.activity_order = 17;

COMMIT;

-- SELECT lesson_number, topic, active FROM student_lessons WHERE slug = 'create-your-superhero';
-- SELECT activity_order, activity_type, title FROM student_lesson_activities la
--   JOIN student_lessons sl ON sl.id = la.student_lesson_id WHERE sl.slug = 'create-your-superhero' ORDER BY 1;
