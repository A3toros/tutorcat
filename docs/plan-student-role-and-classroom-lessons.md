# Plan: Student Role, Pre-Registration, Profile, and Classroom Lesson Track

> **Activity implementation:** Classroom activities are a **complete rewrite** (not extensions of platform lesson components). Picture exercises use **stable `image_url` links**, not emojis. See [plan-student-activities-rewrite.md](./plan-student-activities-rewrite.md) for Lesson 1 specs, component list, and Wikimedia seed URLs.

## Goal

Add a third user category **`student`** (alongside `user` and `admin`) for pre-registered classroom learners. They get:

- A dedicated **profile page** and **dashboard** (separate from the self-serve `user` flow).
- A **new lesson track** with different structure, content, and activities (starting with Lesson 1: *My Online Life*).
- **New database tables** for student lessons and activity content, while **reusing** UI primitives (modals, cards, buttons, drag components, styles) wherever possible.

Existing `user` and `admin` behavior must remain unchanged.

---

## Current state (baseline)

### Roles and auth

| Role | How set | Post-login routing |
|------|---------|-------------------|
| `admin` | `username === 'admin'` on signup, or DB `role` | `/admin/dashboard` |
| `user` | default signup | `/dashboard` → requires CEFR `level` from evaluation test |
| *(none)* | — | `student` does not exist yet |

Relevant code: `functions/auth-verify-otp.ts`, `functions/auth-login.ts`, `src/types/index.ts` (`role?: 'user' \| 'admin'`), `src/app/dashboard/page.tsx` (admin redirect + evaluation gate).

`users` fields used today (from queries): `id`, `email`, `username`, `first_name`, `last_name`, `password_hash`, `level`, `role`, `current_lesson`, `total_stars`, `created_at`, `last_login`, `email_verified`, `eval_test_result`, `session_revoked_at`. Legacy `student_id` exists on the TypeScript `User` type only.

### Lesson model (platform / `user` track)

**Flow (5 UI steps):** warmup → vocabulary → grammar → speaking → improvement  

Mapped from `activity_type` prefixes in `src/app/lessons/page.tsx` (`getStepFromActivityType`).

**Existing activity types** (admin editor + runtime):

- `warm_up_speaking`
- `vocabulary_intro`, `vocabulary_matching_drag`, `vocabulary_fill_blanks`
- `grammar_explanation`, `grammar_sentences` (drag sentence order; backed by `grammar_sentences` rows)
- `speaking_practice`, `listening_practice`, plus improvement/reading variants in submit handler

**Reusable React activity components** (`src/components/lesson/activities/`):

- `VocabularyMatchingDrag.tsx` — Konva drag lines (picture/word match candidate)
- `VocabularyFillBlanks.tsx` — missing letters / dropdown blanks
- `GrammarDragSentence.tsx` — word reorder
- `SpeakingWithFeedback.tsx` — speech-job + AI (heavy; optional for classroom speaking cards)

### Database tables (Neon — inferred from `functions/` usage)

Do not skip columns already required by insert/select/upsert logic.

#### `lessons`

- `id`, `level`, `topic`, `lesson_number`, `created_at`, `updated_at`
- `version`, `last_modified_at` (admin updates)

#### `lesson_activities`

- `id`, `lesson_id`, `activity_type`, `activity_order`
- `title`, `description`, `estimated_time_seconds`
- `content` (JSONB)
- `active` (boolean; `get-lesson` filters `active = TRUE`)
- `created_at`, `updated_at`

#### `vocabulary_items`

- `id`, `activity_id`, `english_word`, `thai_translation`, `audio_url`, `created_at`

#### `grammar_sentences`

- `id`, `activity_id`, `original_sentence`, `correct_sentence`, `words_array` (JSON), `created_at`

#### `user_progress`

- `id`, `user_id`, `lesson_id`, `score`, `completed`, `completed_at`, `attempts`

#### `lesson_activity_results`

- `id`, `user_id`, `lesson_id`, `activity_id` (nullable UUID)
- `activity_type`, `activity_order`
- `score`, `max_score`, `attempts`, `time_spent`, `completed_at`
- `answers`, `feedback` (JSONB)
- Unique constraint: `(user_id, lesson_id, activity_id)` — see `functions/submit-lesson-activity.ts`

#### Other (unchanged for v1)

- `speech_jobs` (optional for student challenge speaking later)
- Achievements / titles tied to platform `user` progression — **out of scope** for student v1 unless product asks

---

## Target: student experience

### Product rules

1. **Pre-register only** — admin (or script) creates accounts; no public student signup.
2. **No evaluation test** — students skip `/evaluation`; no CEFR level required to start.
3. **Fixed curriculum** — ordered classroom lessons (Lesson 1, 2, …), not level-based unlock from `advance-level`.
4. **Lesson metadata** — topic, live session length, communication goal, grammar focus blocks (stored as structured JSON + display on lesson intro).
5. **Website flow per lesson** (Lesson 1 example):

   ```
   Warmup Poll
     → Vocabulary Learning
     → Vocabulary Games
     → Grammar Builder
     → Grammar Practice
     → Speaking Cards
     → Challenge Wheel
     → Exit Ticket
   ```

   This is a **linear section flow** (8 segments), not the platform’s 5-step model. One or more `activity_type` rows per section is fine.

### Lesson 1 reference content

Use the spec in the request as the **content authoring source** (grammar blocks, 15–20 words, exercise copy, poll options, partner questions, challenge prompts). Map each block to activity types in [Content → activity mapping](#lesson-1-content--activity-mapping) below.

---

## Architecture decision: parallel tables (recommended)

**Why:** Keeps platform lessons, admin editor, and `lesson_activity_results` analytics separate; avoids breaking `get-lesson` / `admin-lessons` / achievements. Student-specific activity types and JSON shapes can evolve without migration risk on production lessons.

**Alternative (not recommended for v1):** `lessons.audience` + shared `lesson_activities` — forces every query and admin UI to filter by audience and doubles activity_type union complexity.

### New tables (mirror required fields from existing schema)

#### `student_lessons`

| Column | Type | Notes |
|--------|------|--------|
| `id` | UUID PK | |
| `lesson_number` | int | 1, 2, 3… unique per track |
| `topic` | text | e.g. "My Online Life" |
| `slug` | text unique | optional URL key |
| `live_duration_minutes` | int | e.g. 30 |
| `communication_goal` | text | |
| `grammar_focus` | JSONB | Main grammar, frequency, like/dislike, question forms |
| `vocabulary_list` | JSONB | 15–20 words grouped by category |
| `active` | boolean | default true |
| `version` | int | default 1 |
| `created_at`, `updated_at`, `last_modified_at` | timestamptz | match `lessons` admin patterns |

#### `student_lesson_activities`

Same **required** shape as `lesson_activities`:

| Column | Type |
|--------|------|
| `id`, `student_lesson_id`, `activity_type`, `activity_order` |
| `title`, `description`, `estimated_time_seconds` |
| `content` JSONB |
| `active`, `created_at`, `updated_at` |

#### `student_vocabulary_items`

Mirror `vocabulary_items` + student needs:

| Column | Type |
|--------|------|
| `id`, `activity_id` | |
| `english_word`, `thai_translation` | optional for classroom-only EN |
| `audio_url` | optional |
| `image_url` | optional |
| `emoji` | text | for picture-match (🎮 → play games) |
| `category` | text | Apps/Devices, Activities, Opinions |
| `sort_order` | int |
| `created_at` | |

#### `student_grammar_items`

Mirror `grammar_sentences` and extend for new exercise kinds:

| Column | Type |
|--------|------|
| `id`, `activity_id` | |
| `item_kind` | enum/text | `drag_order`, `mcq`, `frequency_select`, `free_completion`, `error_correction`, `make_question` |
| `original_sentence` | text | nullable |
| `correct_sentence` | text | |
| `words_array` | JSON | drag / make-question word bank |
| `options` | JSONB | MCQ / frequency options + `correct_index` or `correct_value` |
| `hint` | text | optional |
| `sort_order` | int |
| `created_at` | |

#### `student_poll_items`

For warmup / exit / in-lesson polls:

| Column | Type |
|--------|------|
| `id`, `activity_id` | |
| `question` | text |
| `options` | JSONB | `[{ "id", "label" }]` |
| `allow_multiple` | boolean | default false |
| `sort_order` | int |

#### `student_user_progress`

Mirror `user_progress`:

- `user_id`, `student_lesson_id`, `score`, `completed`, `completed_at`, `attempts`
- Unique `(user_id, student_lesson_id)`

#### `student_lesson_activity_results`

Mirror `lesson_activity_results` **exactly** (so submit/finalize logic can be copied):

- `user_id`, `student_lesson_id`, `activity_id`, `activity_type`, `activity_order`
- `score`, `max_score`, `attempts`, `time_spent`, `completed_at`, `answers`, `feedback`
- Unique `(user_id, student_lesson_id, activity_id)`

#### Optional v1.1

- `student_cohorts` + `student_cohort_members` if multiple classes need the same lesson set with different rosters.

### `users` changes (minimal)

- Allow `role = 'student'`.
- Optional: `classroom_code`, `enrolled_at`, `skip_eval` (or infer skip from role only).
- Do **not** overload `level` for classroom track unless you want a display label; progression is `current_student_lesson` or derived from `student_user_progress`.

---

## New student `activity_type` values

Prefix with `student_` to avoid collisions and simplify routing.

| activity_type | Section | Reuse strategy |
|---------------|---------|----------------|
| `student_warmup_poll` | Warmup | **New** UI; store options in `student_poll_items` |
| `student_vocabulary_intro` | Vocabulary learning | Reuse **layout** from `vocabulary_intro`; data from `student_vocabulary_items` |
| `student_vocab_picture_match` | Vocabulary games | **Rewrite** — `image_url` tiles (Wikimedia/stable HTTPS), not emojis or Konva platform matcher |
| `student_vocab_missing_letters` | Vocabulary games | **Adapt** `VocabularyFillBlanks` |
| `student_vocab_categorize` | Vocabulary games | **New** drag-to-buckets; reuse Konva/drag patterns |
| `student_vocab_speed_tap` | Vocabulary games | **New** timed multi-select (30s) |
| `student_grammar_builder` | Grammar builder | **New** read-only / expandable cards from `grammar_focus` JSON on lesson |
| `student_grammar_drag_order` | Grammar practice | **Reuse** `GrammarDragSentence` + `student_grammar_items` |
| `student_grammar_mcq` | Grammar practice | **New** multiple choice |
| `student_grammar_frequency` | Grammar practice | **New** single-select frequency |
| `student_grammar_complete` | Grammar practice | **New** two-blank sentence (app + because) |
| `student_grammar_error_fix` | Grammar practice | **New** edit sentence |
| `student_grammar_make_question` | Grammar practice | **Reuse** drag order variant |
| `student_speaking_cards` | Speaking | **New** card deck (no AI required v1) |
| `student_challenge_wheel` | Challenge | **New** random prompt picker + optional timer |
| `student_exit_poll` | Exit ticket | Same as warmup poll component |

Submit/finalize endpoints: either duplicate as `submit-student-lesson-activity.ts` / `finalize-student-lesson.ts` or one handler with `track=student` — prefer **duplicate thin wrappers** in v1 to avoid regressions.

---

## Lesson 1 content → activity mapping

Suggested `activity_order` and DB population for *Topic 1: My Online Life*:

| Order | Section | activity_type | Content source |
|------:|---------|---------------|----------------|
| 1 | Warmup | `student_warmup_poll` | Poll 1 (hours online) — additional polls can be separate activities or one activity with multiple `student_poll_items` |
| 2 | Vocabulary learning | `student_vocabulary_intro` | Full vocabulary list + optional audio |
| 3 | Vocab games | `student_vocab_picture_match` | Exercise 1 emoji pairs |
| 4 | Vocab games | `student_vocab_missing_letters` | Exercise 2 |
| 5 | Vocab games | `student_vocab_categorize` | Exercise 3 buckets |
| 6 | Vocab games | `student_vocab_speed_tap` | Exercise 4 (30s, target words in `content`) |
| 7 | Grammar builder | `student_grammar_builder` | All grammar focus sections from lesson `grammar_focus` |
| 8 | Grammar practice | `student_grammar_drag_order` | Exercises 1 (2 sentences) → 2 rows in `student_grammar_items` |
| 9 | Grammar practice | `student_grammar_mcq` | Exercise 2 (2 questions) |
| 10 | Grammar practice | `student_grammar_frequency` | Exercise 3 |
| 11 | Grammar practice | `student_grammar_complete` | Exercise 4 template |
| 12 | Grammar practice | `student_grammar_error_fix` | Exercise 5 (2 items) |
| 13 | Grammar practice | `student_grammar_make_question` | Exercise 6 |
| 14 | Speaking | `student_speaking_cards` | Partner questions 1–6 |
| 15 | Challenge | `student_challenge_wheel` | Prompt wheel + 30s timer in `content` |
| 16 | Exit | `student_exit_poll` | Poll 2–4 or combined exit ticket |

Polls 2–4 can also appear **between** sections later; v1 can bundle into exit or warmup only.

---

## Frontend plan

### Routing and guards

| Path | Audience |
|------|----------|
| `/student/dashboard` | `role === 'student'` |
| `/student/profile` | student profile (new page; mirror `src/app/profile/page.tsx` layout, different stats) |
| `/student/lessons` | lesson list for track |
| `/student/lessons/[lessonId]` or query `?lessonId=` | **New** lesson runner (do not reuse `/lessons` step UI) |

Update:

- `ProtectedRoute` / login redirect: `admin` → admin; `student` → `/student/dashboard`; `user` → existing.
- Block students from `/dashboard`, `/evaluation`, `/lessons` (platform).
- Block platform `user` from `/student/*`.

### New lesson runner component

- `src/app/student/lessons/StudentLessonContent.tsx` (name TBD)
- Linear **section progress bar** (8 sections), not `LessonStep` warmup/vocabulary/…
- Section → activities: load from `get-student-lesson` API
- Reuse: `Card`, `Button`, `Modal`, `ProgressBar`, `useNotification`, `lessonProgressStorage` pattern with **separate** localStorage key prefix `student-lesson-progress-{userId}-{lessonId}`
- Copy patterns from `LessonActivityFlow.ts` for session + `BackgroundSaveQueue` against student submit endpoint

### Student profile page

Show:

- Name, username, email (read-only or limited edit per product)
- Current lesson / completion % on student track
- Per-lesson scores (from `student_user_progress`)
- No CEFR level / stars / achievements unless explicitly desired later

### Reuse matrix (components)

| Existing | Student use |
|----------|-------------|
| `VocabularyMatchingDrag` | Picture/word match after adding emoji column support |
| `VocabularyFillBlanks` | Missing letters |
| `GrammarDragSentence` | Drag order + make question |
| `SpeakingWithFeedback` | **Not** for partner cards v1; optional for challenge mode v2 |
| `LessonCompletionModal` | Adapt copy; student pass threshold TBD (60% or completion-only) |
| Admin `LessonEditorContent` | **Do not** extend for v1 — seed Lesson 1 via SQL/JSON script or small `admin-student-lessons` API |

---

## Backend plan

### Auth

- `auth-verify-otp` / `auth-login`: include `role: 'student'` in JWT payload (same as admin/user).
- `auth-me`: return `role` for student routes.

### Admin: pre-register students

New function: `admin-create-student.ts` (or extend `admin-get-users` POST)

- Input: email, username, first_name, last_name, temporary password (or invite flow)
- Sets `role = 'student'`, `level = NULL`, `email_verified = true`
- Optional: assign `lesson_number` start = 1

List/filter students in admin dashboard (`role = 'student'`).

### Student lesson APIs

| Function | Based on |
|----------|----------|
| `get-student-lesson.ts` | `get-lesson.ts` — join `student_lesson_activities`, vocab/grammar/poll child tables |
| `get-student-dashboard.ts` | `get-dashboard-data.ts` — list lessons + progress |
| `submit-student-lesson-activity.ts` | `submit-lesson-activity.ts` |
| `finalize-student-lesson.ts` | `finalize-lesson.ts` — pass threshold policy for classroom |
| `admin-student-lessons.ts` | `admin-lessons.ts` CRUD for seeding/editing track |

All student queries must filter by `users.role = 'student'` on write paths (defense in depth).

### Migrations

Add SQL migration file under repo (Neon applied manually or via pipeline):

1. Create tables above with indexes on `(student_lesson_id, activity_order)`, `(user_id, student_lesson_id)`.
2. `CHECK (role IN ('user', 'admin', 'student'))` if role is constrained today.
3. Seed script for Lesson 1 row + activities (JSON export from content doc).

---

## Implementation phases

### Phase 0 — Schema and types

- [ ] SQL migration for new tables + `users.role` student
- [ ] `src/types/student.ts` — `StudentLesson`, `StudentActivityType`, content interfaces
- [ ] Seed Lesson 1 content

### Phase 1 — Auth and shell

- [ ] Admin pre-register API + UI tab “Students”
- [ ] Login redirect for `student`
- [ ] `/student/dashboard`, `/student/profile` (read-only stats)

### Phase 2 — Lesson runner (read-only → interactive)

- [ ] `get-student-lesson` + list endpoint
- [ ] Section progress UI
- [ ] Implement activities in order: poll → vocab intro → picture match → fill blanks → categorize → speed tap
- [ ] Wire submit + localStorage

### Phase 3 — Grammar and speaking

- [ ] Grammar builder (static) + drag, MCQ, frequency, complete, error fix, make question
- [ ] Speaking cards + challenge wheel + exit poll
- [ ] `finalize-student-lesson` + completion modal

### Phase 4 — Admin content tools (optional)

- [ ] `admin-student-lessons` editor (clone patterns from `LessonEditorContent.tsx`)
- [ ] Lesson 2+ authoring workflow

### Phase 5 — Polish

- [ ] i18n keys under `student.*` in locales
- [ ] E2E: student login → complete Lesson 1 section smoke test
- [ ] Analytics: separate admin view for `student_lesson_activity_results`

---

## Open product decisions (resolve before build)

1. **Pass threshold** — Keep 60% like platform, or “complete all sections” only?
2. **Speaking** — Partner cards without microphone vs. optional recording on challenge wheel?
3. **Thai translations** — Required on `student_vocabulary_items` or English-only classroom?
4. **Poll results** — Store aggregate only, per-user answers in `answers` JSON, or anonymous?
5. **Same email domain** — Can a person be both `user` and `student`, or strictly one role per account?

---

## Files likely touched (checklist)

**New**

- `docs/plan-student-role-and-classroom-lessons.md` (this file)
- `migrations/YYYYMMDD_student_track.sql`
- `functions/get-student-lesson.ts`, `submit-student-lesson-activity.ts`, `finalize-student-lesson.ts`, `get-student-dashboard.ts`, `admin-create-student.ts`, `admin-student-lessons.ts`
- `src/app/student/dashboard/page.tsx`, `src/app/student/profile/page.tsx`, `src/app/student/lessons/page.tsx`
- `src/components/student/activities/*` (thin wrappers around lesson activities where possible)

**Modify**

- `src/types/index.ts` — `role` union includes `student`
- `functions/auth-login.ts`, `auth-verify-otp.ts`, `auth-me.ts`
- `src/components/auth/LoginModal.tsx`, `ProtectedRoute.tsx`
- `src/app/dashboard/page.tsx` — redirect students away (mirror admin pattern)

**Do not modify in v1 (unless bugfix)**

- `src/app/lessons/page.tsx` platform step flow
- `functions/admin-lessons.ts` platform CRUD
- Achievement / `advance-level` for students

---

## Success criteria

1. Admin can pre-register a student and log in as that student.
2. Student lands on student dashboard, opens Lesson 1, and completes the 8-section flow in order.
3. Progress persists in `student_lesson_activity_results` and `student_user_progress` with the same field coverage as platform results.
4. Platform `user` and `admin` flows are unaffected.
5. Lesson 1 content matches the provided spec (activities, polls, grammar exercises, speaking prompts).
