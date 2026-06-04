-- Student classroom track: new tables + MWS roster (Student IDs 52439–52470)
-- Run in Neon SQL editor (or psql). Safe to re-run: uses IF NOT EXISTS / ON CONFLICT.
--
-- Login: username = Student ID (e.g. 52439), password = same ID (e.g. 52439)
-- Email is 52439@mws.ac.th (not used for login).
-- Regenerate hashes: node scripts/gen-student-roster-values.js
-- Fix existing rows: this migration sets username + password_hash for roster users.

BEGIN;

-- ---------------------------------------------------------------------------
-- users.role: allow 'student' (Neon may have chk_users_role = user/admin only)
-- ---------------------------------------------------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS chk_users_role;

ALTER TABLE users ADD CONSTRAINT chk_users_role
  CHECK (role IN ('user', 'admin', 'student'));

-- ---------------------------------------------------------------------------
-- users: classroom identity columns
-- ---------------------------------------------------------------------------
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS school_student_id TEXT,
  ADD COLUMN IF NOT EXISTS honorific TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS current_student_lesson INTEGER DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS users_school_student_id_unique
  ON users (school_student_id);

COMMENT ON COLUMN users.school_student_id IS 'External school ID (e.g. 52439)';
COMMENT ON COLUMN users.honorific IS 'Mr / Miss';
COMMENT ON COLUMN users.nickname IS 'Preferred display name';
COMMENT ON COLUMN users.current_student_lesson IS 'Next student_lessons.lesson_number to start';

-- ---------------------------------------------------------------------------
-- student_lessons
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_lessons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lesson_number INTEGER NOT NULL,
  topic TEXT NOT NULL,
  slug TEXT UNIQUE,
  live_duration_minutes INTEGER,
  communication_goal TEXT,
  grammar_focus JSONB NOT NULL DEFAULT '{}'::jsonb,
  vocabulary_list JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- New lessons start hidden; admin enables when ready.
  active BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_modified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_lessons_lesson_number_unique UNIQUE (lesson_number)
);

CREATE INDEX IF NOT EXISTS idx_student_lessons_active
  ON student_lessons (active, lesson_number);

-- ---------------------------------------------------------------------------
-- student_lesson_activities (mirrors lesson_activities)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_lesson_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_lesson_id UUID NOT NULL REFERENCES student_lessons (id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,
  activity_order INTEGER NOT NULL,
  title TEXT,
  description TEXT,
  estimated_time_seconds INTEGER,
  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_lesson_activities_order_unique
    UNIQUE (student_lesson_id, activity_order)
);

CREATE INDEX IF NOT EXISTS idx_student_lesson_activities_lesson
  ON student_lesson_activities (student_lesson_id, activity_order)
  WHERE active = TRUE;

-- ---------------------------------------------------------------------------
-- student_vocabulary_items (mirrors vocabulary_items + emoji/category)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_vocabulary_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES student_lesson_activities (id) ON DELETE CASCADE,
  english_word TEXT NOT NULL,
  thai_translation TEXT,
  audio_url TEXT,
  image_url TEXT,
  emoji TEXT,
  category TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_vocabulary_items_activity
  ON student_vocabulary_items (activity_id, sort_order);

-- ---------------------------------------------------------------------------
-- student_grammar_items (mirrors grammar_sentences + exercise kinds)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_grammar_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES student_lesson_activities (id) ON DELETE CASCADE,
  item_kind TEXT NOT NULL,
  original_sentence TEXT,
  correct_sentence TEXT NOT NULL,
  words_array JSONB,
  options JSONB,
  hint TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT student_grammar_items_kind_check CHECK (
    item_kind IN (
      'drag_order',
      'mcq',
      'frequency_select',
      'free_completion',
      'error_correction',
      'make_question'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_student_grammar_items_activity
  ON student_grammar_items (activity_id, sort_order);

-- ---------------------------------------------------------------------------
-- student_poll_items
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_poll_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL REFERENCES student_lesson_activities (id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  allow_multiple BOOLEAN NOT NULL DEFAULT FALSE,
  -- If set, the student must choose this option id to proceed.
  correct_option_id TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_student_poll_items_activity
  ON student_poll_items (activity_id, sort_order);

-- ---------------------------------------------------------------------------
-- student_user_progress (mirrors user_progress)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_user_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  student_lesson_id UUID NOT NULL REFERENCES student_lessons (id) ON DELETE CASCADE,
  score INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  attempts INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT student_user_progress_user_lesson_unique
    UNIQUE (user_id, student_lesson_id)
);

CREATE INDEX IF NOT EXISTS idx_student_user_progress_user
  ON student_user_progress (user_id);

-- ---------------------------------------------------------------------------
-- student_lesson_activity_results (mirrors lesson_activity_results)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS student_lesson_activity_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  student_lesson_id UUID NOT NULL REFERENCES student_lessons (id) ON DELETE CASCADE,
  activity_id UUID REFERENCES student_lesson_activities (id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL,
  activity_order INTEGER NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 1,
  time_spent INTEGER,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  feedback JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS student_lesson_activity_results_user_lesson_activity
  ON student_lesson_activity_results (user_id, student_lesson_id, activity_id)
  WHERE activity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_student_lesson_activity_results_user_lesson
  ON student_lesson_activity_results (user_id, student_lesson_id, activity_order);

-- ---------------------------------------------------------------------------
-- speech_jobs compatibility (student prompt_id / lesson_id can exceed VARCHAR(20))
-- ---------------------------------------------------------------------------
ALTER TABLE IF EXISTS speech_jobs
  ALTER COLUMN prompt_id TYPE TEXT;

ALTER TABLE IF EXISTS speech_jobs
  ALTER COLUMN lesson_id TYPE TEXT;

-- ---------------------------------------------------------------------------
-- Pre-register MWS students (role = student)
-- Email: {school_student_id}@mws.ac.th
-- Username: school_student_id (matches email local-part; always unique)
-- ---------------------------------------------------------------------------
INSERT INTO users (
  email,
  username,
  first_name,
  last_name,
  password_hash,
  level,
  role,
  email_verified,
  school_student_id,
  honorific,
  nickname,
  current_student_lesson
)
VALUES
  ('52439@mws.ac.th', '52439', 'Krittapas', 'Ruangkanokmas', '$2a$12$hqQvLpHKZ7it4w8Vye0ps.j6yhFi0..U8t0BoYmKfHS1dZeWNIEv.', NULL, 'student', TRUE, '52439', 'Mr', 'Ikki', 1),
  ('52440@mws.ac.th', '52440', 'Nuntaput', 'Noimanee', '$2a$12$t7VzUNEIXWq2neVcJ61o.OsNnp3VZpq/Rd29GNc3nX2hfNRfO6OBO', NULL, 'student', TRUE, '52440', 'Mr', 'Tonkow', 1),
  ('52441@mws.ac.th', '52441', 'Nipitpon', 'Phensant', '$2a$12$Qk.7fHQpGKCAekwjRp3wluxxsT3gUBEcN5.s0pI8ABJXz/kIWUERm', NULL, 'student', TRUE, '52441', 'Mr', 'August', 1),
  ('52442@mws.ac.th', '52442', 'Pakin', 'Chatarooprutchadakorn', '$2a$12$xflgyJ3aUPRN5ubCmmsugOjPInXr.iia8sPeaozA84w.JISvzNLXy', NULL, 'student', TRUE, '52442', 'Mr', 'Ice', 1),
  ('52443@mws.ac.th', '52443', 'Paphinwish', 'Prugsamatz', '$2a$12$FL2HZVqEM3mvnKne2QHc6.vVETbgLxlfNAl.RsEAw/2P9Ef2LW9si', NULL, 'student', TRUE, '52443', 'Mr', 'Namo', 1),
  ('52444@mws.ac.th', '52444', 'Poohrikhun', 'Phumafiang', '$2a$12$/5yY8McaiqujcfmpMDzpY.sRAgT9.wUPjR.EdMfB311FUnHJOPh2G', NULL, 'student', TRUE, '52444', 'Mr', 'Pupha', 1),
  ('52445@mws.ac.th', '52445', 'Warintron', 'Yucharoen', '$2a$12$MWW26Y4jGa4TqIO8/CL3iOUZPy6UeObRNBNxzNg0dj77D6XFLeczS', NULL, 'student', TRUE, '52445', 'Mr', 'Fin', 1),
  ('52446@mws.ac.th', '52446', 'Anut', 'Saksirichai', '$2a$12$EUmKobxo2eI4oHkd0vlLo.JgRS8GPxEXjyf99a59vAu2LEn0zrQFm', NULL, 'student', TRUE, '52446', 'Mr', 'Omo', 1),
  ('52447@mws.ac.th', '52447', 'Channantip', 'Boonking', '$2a$12$b8DHsiypWya/GaPmOoYf3Ow2XyyNu.QBB9PGdZKvAdKtTpTZqS/sC', NULL, 'student', TRUE, '52447', 'Miss', 'Namo', 1),
  ('52448@mws.ac.th', '52448', 'Nathita', 'Chiencharoonwong', '$2a$12$cD7RMhcg39CAgmbsxywKKOhQATeqnRRI6QR7mvbCB1CgIDRL/fSPG', NULL, 'student', TRUE, '52448', 'Miss', 'Aeya', 1),
  ('52449@mws.ac.th', '52449', 'Nitchanikan', 'Ueasiyaphan', '$2a$12$xaP1O98y5sl7ANLb7bnCEu.uBWZqXbQBwTiP3mttcDpQeqnwdxrhm', NULL, 'student', TRUE, '52449', 'Miss', 'Tuphom', 1),
  ('52450@mws.ac.th', '52450', 'Drishti', 'Raidani', '$2a$12$J29lVjW8w5sdBa4QvtNxkO2M/irbEk3JtdHwb7/FVdaf3uMhhVqqG', NULL, 'student', TRUE, '52450', 'Miss', 'Amy', 1),
  ('52451@mws.ac.th', '52451', 'Narapat', 'Aroonrueangaram', '$2a$12$2bEHevJ3ULlLEuYdCxcXKOirncE0g301rMP0Mj7WBpCtnTh60LQsi', NULL, 'student', TRUE, '52451', 'Miss', 'Nara', 1),
  ('52452@mws.ac.th', '52452', 'Nichapha', 'Praphansen', '$2a$12$iZ/jpXbIyVvTNZhJzrJs7enHWf347Q78WkCjLkaIpIivAl9XM8Rtm', NULL, 'student', TRUE, '52452', 'Miss', 'Kaewta', 1),
  ('52453@mws.ac.th', '52453', 'Woranita', 'Prarakkamo', '$2a$12$cEWxh17h5l/Scr47roAlFectUScIrJsMrSJqanqbSHFz0u0ediAWu', NULL, 'student', TRUE, '52453', 'Miss', 'Lemon', 1),
  ('52454@mws.ac.th', '52454', 'Jiraphat', 'Tansuntondnant', '$2a$12$caw5CqClonmxwTJac/OJzuFPIAXSI4jbvO5lkutH1tgrOX579wPBW', NULL, 'student', TRUE, '52454', 'Mr', 'Atom', 1),
  ('52455@mws.ac.th', '52455', 'Chayuth', 'Leehirunsakul', '$2a$12$z4Oo37nMBJ9elYBcOnunc.cfHROIvZoK1dYOKl8SIblgA1mo2SnmK', NULL, 'student', TRUE, '52455', 'Mr', 'Newton', 1),
  ('52456@mws.ac.th', '52456', 'Thitisak', 'Ruangrangsee', '$2a$12$uq2VEE/iGY/Zd3f0bW9cf.qo/jp7VVf9LLcKWvKrIXQGh5zWrGmG.', NULL, 'student', TRUE, '52456', 'Mr', 'Guitar', 1),
  ('52457@mws.ac.th', '52457', 'Thanakorn', 'Boonthong', '$2a$12$IBsA.nqYJmn56eJBYt4F4.wCEGRObf/iq9Bg2QgGRn1qhyWuzlTdC', NULL, 'student', TRUE, '52457', 'Mr', 'Tiger', 1),
  ('52458@mws.ac.th', '52458', 'Nannanon', 'Manuchchanon', '$2a$12$n3Nd7BVzfjMy2lU1LFjZb.KMPdPLzmq9yMWM5Mb6k96N9UINiu.G.', NULL, 'student', TRUE, '52458', 'Mr', 'Neo', 1),
  ('52459@mws.ac.th', '52459', 'Pannathorn', 'Chiaovit', '$2a$12$XLDsMC8zK7hnrQQHJXW33OzD0mfn0qlwp/rg2q7IRbyUeXfsyFMU2', NULL, 'student', TRUE, '52459', 'Mr', 'Rotfiat', 1),
  ('52460@mws.ac.th', '52460', 'Pornpipat', 'Sudmor', '$2a$12$gKFLIhZ9YL.3pCAxjv4ICOny4tGCBPWMxJetqGAonLrdccVxr.8i6', NULL, 'student', TRUE, '52460', 'Mr', 'Sun', 1),
  ('52461@mws.ac.th', '52461', 'Peerawas', 'Rungtaveehirun', '$2a$12$Dz/knhkYqLW6sy7fDYTvFuaxHmQc/S23q8GxyUnwvzk3gmv6W9n.C', NULL, 'student', TRUE, '52461', 'Mr', 'Ikkyu', 1),
  ('52462@mws.ac.th', '52462', 'Richawi', 'Pintubtim', '$2a$12$zooe4pshgbDhzNIjZXdAVOfMitK3iZG9C5KqwqnnXYyp5MIS6jp9a', NULL, 'student', TRUE, '52462', 'Mr', 'Bank', 1),
  ('52463@mws.ac.th', '52463', 'Sakkayabutr', 'Wiwatdechakun', '$2a$12$bC7wB5WNBsM64NSMQ7cQL.8PaOwpBP9UYcCBQUxLBdpDobID23ujK', NULL, 'student', TRUE, '52463', 'Mr', 'Pep', 1),
  ('52464@mws.ac.th', '52464', 'Suraphat', 'Thaikul', '$2a$12$dklGowGooNeq7UOFeclEXOXNicL/OT1q8jyDNbR1iOsgM6zx8nruS', NULL, 'student', TRUE, '52464', 'Mr', 'Meetang', 1),
  ('52465@mws.ac.th', '52465', 'Suwijuck', 'Promjai', '$2a$12$Kr6F36fkoLlKeJ7eleuck.NDLo2MEwGPi/bhT6FtqbN1tfPpRTJ.q', NULL, 'student', TRUE, '52465', 'Mr', 'BJ', 1),
  ('52466@mws.ac.th', '52466', 'Thithisuda', 'Chitchamnong', '$2a$12$gpnZD6MX.vwXUeke5CR.sOp18Sths1LnVAfQeJQPqlC0J//x.qT5O', NULL, 'student', TRUE, '52466', 'Miss', 'Aioon', 1),
  ('52467@mws.ac.th', '52467', 'Ployphitcha', 'Assawakalfar', '$2a$12$H45BswMw/17sCmCqjcgtYOx9kICcTHcg6zm0H7e1s07THBqekDX86', NULL, 'student', TRUE, '52467', 'Miss', 'Ploy', 1),
  ('52468@mws.ac.th', '52468', 'Pawinee', 'Chinnarach', '$2a$12$DM4/auxLaWbRxLHV3My9tOVfvZBmLFty9ZpZbkexOnkyE4VCPbjsm', NULL, 'student', TRUE, '52468', 'Miss', 'Minnie', 1),
  ('52469@mws.ac.th', '52469', 'Waratchaya', 'Jinnapat', '$2a$12$SDQfIHa2UQJzJvL44VvcuuFb6fNJJqIkQEa75BR3LsleTOi1ff9NO', NULL, 'student', TRUE, '52469', 'Miss', 'Klao', 1),
  ('52470@mws.ac.th', '52470', 'AI', 'Noiboonya', '$2a$12$wEt3yW9fOLnAa6C5bIU//Oz4FMdCGzQ9p8CHKQ94hTltLEiqlltg2', NULL, 'student', TRUE, '52470', 'Miss', 'Aioon', 1)
ON CONFLICT (school_student_id) DO UPDATE SET
  email = EXCLUDED.email,
  username = EXCLUDED.username,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  honorific = EXCLUDED.honorific,
  nickname = EXCLUDED.nickname,
  role = 'student',
  email_verified = TRUE,
  password_hash = EXCLUDED.password_hash;

-- ---------------------------------------------------------------------------
-- Test student (QA)
-- Login: username 111111, password 111111
-- ---------------------------------------------------------------------------
INSERT INTO users (
  email,
  username,
  first_name,
  last_name,
  password_hash,
  level,
  role,
  email_verified,
  school_student_id,
  honorific,
  nickname,
  current_student_lesson
)
VALUES (
  '111111@mws.ac.th',
  '111111',
  'Test',
  'Student',
  '$2a$12$KXWbEtyqDGhlkRw1LMBol.A./6ooWys2ASrWvwfan7uLLvGZrwk1G',
  NULL,
  'student',
  TRUE,
  '111111',
  'Mr',
  'Test',
  1
)
ON CONFLICT (school_student_id) DO UPDATE SET
  email = EXCLUDED.email,
  username = EXCLUDED.username,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  honorific = EXCLUDED.honorific,
  nickname = EXCLUDED.nickname,
  role = 'student',
  email_verified = TRUE,
  password_hash = EXCLUDED.password_hash,
  current_student_lesson = COALESCE(users.current_student_lesson, 1);

-- If school_student_id column was empty on first run, also handle email/username conflicts:
-- (Run manually only if inserts fail on unique email/username)
-- UPDATE users SET role = 'student' WHERE school_student_id BETWEEN '52439' AND '52470';

COMMIT;

-- ---------------------------------------------------------------------------
-- Verify roster (optional)
-- ---------------------------------------------------------------------------
-- SELECT school_student_id, honorific, first_name, last_name, nickname, email, username, role
-- FROM users
-- WHERE school_student_id >= '52439' AND school_student_id <= '52470'
-- ORDER BY school_student_id::int;
