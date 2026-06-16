-- Lesson 3: shift from superhero theme to general character design + personality/story

BEGIN;

UPDATE student_lessons
SET
  communication_goal = 'Students design a character, describe appearance and personality, and write a short story.',
  grammar_focus = $gf${
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
  vocabulary_list = $vl$[
    {"category": "Appearance", "words": ["tall", "short", "young", "hair", "eyes"]},
    {"category": "Clothes", "words": ["shirt", "pants", "shoes", "jacket", "dress"]},
    {"category": "Colors", "words": ["blue", "green", "brown", "black", "blond"]},
    {"category": "Personality", "words": ["friendly", "kind", "funny", "clever", "creative", "helpful", "serious", "quiet", "confident", "shy", "lazy", "rude", "selfish", "mean"]}
  ]$vl$::jsonb
WHERE slug = 'design-your-own-character';

UPDATE student_lesson_activities la
SET
  description = 'Use the character creator: pick skin, eyes, mouth, hair, top, bottom, shoes, features, and extra. Press Continue when finished.',
  content = '{}'::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_character_builder';

UPDATE student_lesson_activities la
SET content = $mcq${
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
}$mcq$::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_vocab_image_mcq';

UPDATE student_lesson_activities la
SET
  description = $desc$Appearance: She has long hair. / He has brown eyes. / She wears a blue shirt.
Personality: He is friendly. / She is creative.

Build three sentences about your character using the dropdowns.$desc$,
  content = $sent${
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
  }$sent$::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_character_description';

UPDATE student_lesson_activities la
SET
  description = 'Talk about your character. Answer each question out loud — AI will listen and give feedback.',
  content = $json${
    "source_activity_order": 1,
    "prompts": [
      "What makes your character special?",
      "What does your character look like?",
      "What is your character's personality?",
      "What does your character like to do?"
    ]
  }$json$::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_character_story';

UPDATE student_lesson_activities la
SET content = '{"duration_seconds": 30, "prompts": ["Describe your character''s appearance.", "What is your character''s personality?", "What does your character like doing?", "Would you be friends with your character? Why?"]}'::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_challenge_wheel';

-- Appearance vocabulary (activity 2) — see 20260616070000 for photos + Thai
-- Personality vocabulary (activity 4) — see 20260616090000 for images + Thai
COMMIT;
