-- Test student for local / QA (not part of MWS roster classes)
-- Login: username 111111, password 111111
-- Email: 111111@mws.ac.th

BEGIN;

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
  'Grorgr',
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

COMMIT;
