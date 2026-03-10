# Plan: Admin View for AI-Flagged Speaking Prompts

## Goal

Give admins a **per-lesson / per-test view** of:

- **All student speaking responses** (prompts + transcripts)
- Whether each response was **AI-flagged** by the integrity detector
- Basic integrity metadata (risk score, signals)

So an admin can answer:

- “For lesson X, how many students used AI in speaking practice?”
- “For evaluation test EVAL-1, which students were flagged on speaking questions?”

---

## Existing data & schema

### Where spoken answers live today

- **Lesson speaking practice**:
  - Table: `lesson_activity_results`
  - Insert/update: `functions/submit-lesson-activity.ts`
  - Column: `answers` (JSONB) — already stores:
    - `transcripts` per prompt
    - `feedback` (including speaking feedback details)
    - in some flows, individual `improvedTranscript` / `improvedTranscripts`
  - Integrity: currently only in **AI response**, not persisted to DB.

- **Evaluation speaking (EVAL-1)**:
  - Table: `evaluation_results`
  - Insert: `functions/submit-evaluation.ts`
  - Column: `question_results` (JSONB) with:
    - `evaluation` (overall)
    - `answers` (per question, including speaking answers/feedback)
  - Integrity: also only present in AI responses.

- **Background speech jobs**:
  - Table: `speech_jobs`
  - Background function: `functions/run-speech-analysis-background.ts`
  - Columns:
    - `transcript`
    - `prompt`
    - `cefr_level`
    - `result_json` — **already stores** `integrity` for some flows.

### Existing admin APIs

- `functions/admin-vocabulary.ts`: admin CRUD for vocabulary, showing:
  - per-item lesson info (`lesson_topic`, `level`).
- `functions/admin-evaluation.ts`: CRUD for `evaluation_test` (test config).
- `functions/admin-lessons.ts` / `admin-get-user-lessons.ts` / `admin-get-stats.ts`: read lesson & progress stats (including counts from `lesson_activity_results`).

We will **reuse** the admin auth pattern and Neon connection style from `admin-vocabulary.ts` / `admin-evaluation.ts`.

---

## Data model changes

### Option A: Extend existing JSON fields (minimal schema change) ✅ Recommended

1. **Lesson speaking practice** (`lesson_activity_results.answers` JSONB):

   - On write (in `submit-lesson-activity.ts` speaking paths), when we have:
     - `transcripts` per prompt
     - feedback objects with `integrity`
   - Ensure we persist:
     - `answers.feedback[<promptId>].integrity` (already in-memory)
     - Optionally a summary:
       - `answers.integrity_summary = { any_flagged: boolean, max_risk: number }`

2. **Evaluation results** (`evaluation_results.question_results` JSONB):

   - When building `questionResults` in `submit-evaluation.ts`, preserve:
     - For each speaking question: `answers[questionId].feedback.integrity`
   - Optionally add:
     - `question_results.integrity_summary = { any_flagged: boolean, max_risk: number }`

3. **Speech jobs** (already has `result_json.integrity` in `run-speech-analysis-background.ts`):

   - No schema change; just **read** from `speech_jobs.result_json.integrity`.

This keeps DB migrations light; we only depend on JSONB shape we already control.

### Option B: New table `speech_integrity_events` (heavier)

For future analytics, we may later add a dedicated table:

- `speech_integrity_events`:
  - `id` (PK)
  - `user_id`
  - `lesson_id` or `test_id`
  - `activity_type` (`lesson_speaking`, `evaluation_speaking`, `warmup`, etc.)
  - `prompt` (text)
  - `transcript` (shortened)
  - `risk_score` (0–100)
  - `flagged` (bool)
  - `signals` (JSON)
  - `created_at`

For this plan, **A is enough**; B is a future enhancement.

---

## New admin endpoint: list prompts + AI flags

### Endpoint

`GET /.netlify/functions/admin-speaking-flags`

### Auth

- Reuse `authenticateAdmin(event)` from `admin-vocabulary.ts` / `admin-evaluation.ts`.

### Query parameters

- `scope`: `"lessons"` | `"evaluation"` | `"jobs"` (default `"lessons"`)
- `lessonId` (optional): filter by lesson ID (`A1-L91`, etc.)
- `testId` (optional): filter by evaluation test ID (`EVAL-1`)
- `userId` (optional): show responses for a single student
- Pagination: `page`, `limit`

### Response shapes (high-level)

1. **scope=lessons** → from `lesson_activity_results`:

```json
{
  "success": true,
  "items": [
    {
      "user_id": "uuid",
      "lesson_id": "A1-L91",
      "activity_order": 3,
      "activity_type": "speaking_with_feedback",
      "prompt": "Describe your daily routine...",
      "transcript": "Hi, my name is...",
      "integrity": {
        "risk_score": 72,
        "flagged": true,
        "message": "Your answer was flagged for using AI. Please try again using your own words.",
        "signals": {
          "level_mismatch": 80,
          "off_syllabus_vocab": 65,
          "robotic_cues": 70
        }
      },
      "created_at": "ISO timestamp"
    }
  ],
  "pagination": { "page": 1, "totalPages": 3, "total": 57 }
}
```

2. **scope=evaluation** → from `evaluation_results`:

Similar shape, but with `test_id`, `question_id`, and question prompt.

3. **scope=jobs** → from `speech_jobs`:

Debug/low-level view, mostly for ops.

---

## Admin UI: columns + “View prompts” button

### Where in the UI

- Add to existing **admin users** and **admin evaluation / lessons** panels:

1. **Evaluation tests admin page** (for `evaluation_test`):

   - New column: **“Speaking Flags”**
     - Shows count of flagged speaking answers for that test (e.g. `3 flagged / 45 attempts`).
   - New button per row: **“View prompts”**
     - Opens a modal/page that calls `admin-speaking-flags?scope=evaluation&testId=EVAL-1`.
     - Table inside modal:
       - Student (user email/username)
       - Question prompt
       - Transcript (first 120 chars, expandable)
       - Integrity risk (badge with color)
       - Flagged (Yes/No)

2. **Lessons admin page** (for `lessons`):

   - New column: **“AI Flags (speaking)”**
     - Summaries like `2 flagged / 30 attempts`.
   - New button: **“View speaking prompts”**
     - Calls `admin-speaking-flags?scope=lessons&lessonId=A1-L91`.
     - Same table layout as above, but grouped by activity/prompt ID.

3. **Users admin page** (global transcripts browser):

   - Add a new primary button **to the left of “Search users”** called **“Transcripts”**.
   - Clicking it opens a dedicated **Transcripts** view that queries `admin-speaking-flags?scope=jobs` (or `scope=lessons` without `lessonId` filter) and shows:
     - Most recent speech jobs across all users, ordered by `created_at DESC`.
     - Columns:
       - Student (email/username)
       - Lesson (from `lesson_id`, if present)
       - Prompt (shortened)
       - Status (`processing` / `analyzing` / `completed` / `failed`)
       - Integrity risk (badge)
       - Flagged (Yes/No; **flagged rows highlighted in red**)
     - Each row has a **toggle / “View details”** control that expands to show:
       - Full transcript
       - Full integrity object (risk score + signals)
       - Any grammar/vocab corrections if included in `result_json`.

### UI behaviors

- **Default sort**: flagged first, then newest.
- **Filters**:
  - Toggle: “Show only flagged”
  - Search by student email/username
- **Row highlighting**:
  - Any transcript with `integrity.flagged = true` is visually highlighted (e.g. red left border or red background tint).
- **Privacy**:
  - Show only context needed (no full essay history).
  - Optionally truncate transcripts with “View full” expand.

---

## Implementation steps

1. **New admin Netlify function (read from `speech_jobs` only)**

   - Create `functions/admin-speaking-flags.ts`:
     - Copy auth + Neon boilerplate from `admin-vocabulary.ts`.
     - Implement query logic for `scope` against `speech_jobs`:
       - `lessons` → filter by `lesson_id` (and optional `userId`), `status = 'completed'`, `result_json->'integrity'` not null.
       - `evaluation` → filter by `lesson_id` / `prompt_id` patterns used by evaluation speaking, same integrity filter.
       - `jobs` → generic view; optionally filter by `userId`.
     - Normalize each row into `{ user_id, lesson_id, prompt, prompt_id, transcript, integrity, created_at }`.

2. **Admin frontend updates**

   - In the admin evaluation UI:
     - Add a column and “View prompts” button that fetches from `admin-speaking-flags`.
   - In the admin lessons UI:
     - Similar column + button for lesson-level speaking.
   - Reuse existing table and modal components where possible.

3. **Performance & safety**

   - Add pagination & simple limits (e.g. max 100 items per page).
   - Make sure long transcripts are truncated server-side (e.g. `LEFT(transcript, 500)`).
   - Consider an index on:
     - `lesson_activity_results (lesson_id, activity_type)`
     - `evaluation_results (test_id)`
     - `speech_jobs (status, lesson_id/test_id)` if relevant.

4. **Future enhancements**

   - Per-user AI-usage summary for admins (“% of speaking attempts flagged”).
   - Export CSV of flagged answers.
   - Heatmap of lessons/tests with highest AI usage.

---

## Summary

- **Backend**: read **only** from `speech_jobs` (transcript, prompt, integrity) via a new `admin-speaking-flags` function.
- **Frontend**: add “AI Flags” columns and **View prompts** buttons in the admin evaluation/lessons panels, showing per-prompt transcripts from `speech_jobs` and whether each was flagged for AI. 
