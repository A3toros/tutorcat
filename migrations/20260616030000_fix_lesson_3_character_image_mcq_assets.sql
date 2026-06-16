-- Fix lesson 3 image→word MCQ assets (correct glasses, cape, armor, sword paths)

BEGIN;

UPDATE student_lesson_activities la
SET content = $mcq${
  "items": [
    {
      "image_url": "/characters/features/glasses.png",
      "prompt": "Character with glasses",
      "choices": ["cape", "glasses", "sword", "armor"],
      "correct": "glasses"
    },
    {
      "image_url": "/characters/extra/sword.gif",
      "prompt": "Character with a sword",
      "choices": ["cape", "glasses", "sword", "armor"],
      "correct": "sword"
    },
    {
      "image_url": "/characters/extra/cape.png",
      "prompt": "Character with a cape",
      "choices": ["cape", "hair", "beard", "pet"],
      "correct": "cape"
    },
    {
      "image_url": "/characters/top/top21.png",
      "prompt": "Character wearing armor",
      "choices": ["hoodie", "armor", "wizard robe", "sports clothes"],
      "correct": "armor"
    }
  ]
}$mcq$::jsonb
FROM student_lessons sl
WHERE sl.id = la.student_lesson_id
  AND sl.slug = 'design-your-own-character'
  AND la.activity_type = 'student_vocab_image_mcq';

COMMIT;
