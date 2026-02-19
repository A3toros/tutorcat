# Plan: Block Progression Below 60% and Reset Lesson Attempt

## Goal

If a user finishes a lesson (or attempts to progress/level-up) with a **final lesson score < 60%**, we should:

- **Not allow progression** (no “continue to next lesson / next level”).
- **Prompt the user to retry** the same lesson.
- **Delete all data for this lesson attempt** from the database and from **local storage** (so the retry starts clean). **Only that one lesson** is reset; no other lessons or user data are affected.

This prevents the current failure mode where a lesson can be marked “completed” (and counted toward level advancement) even when it is not passed.

---

## Current behavior (what’s going wrong)


### Backend

- `functions/finalize-lesson.ts`
  - Calculates `percentage` and `isPassed = percentage >= 60`.
  - **Still writes `user_progress.completed = true` regardless of `isPassed`.**
  - Awards stars only if passed (good), but the completed flag is what drives progression.

- `functions/advance-level.ts`
  - Counts completed lessons using `user_progress.completed = true`.
  - Because failing lessons are still marked completed, a user can advance a level even if they scored < 60% on the final lesson.

- `functions/submit-lesson-activity.ts`
  - Updates `user_progress.completed = true` when the “final activity” is submitted (even though this endpoint cannot know final lesson %).
  - This can also incorrectly mark a lesson as completed before/without a correct pass/fail decision.

### Frontend

- `src/components/lesson/LessonCompletionModal.tsx`
  - Always renders “Continue to Next Lesson” and allows the user to proceed even when `percentage < 60`.
  - It shows a “Try Again” button for failures, but **does not block progression**.

---

## Desired behavior (rules)

- **Pass threshold**: 60% (already used everywhere).
- When a lesson is finalized with **percentage < 60**:
  - The lesson must be treated as **not passed** and **not completed**.
  - The user must be **blocked from progressing** to the next lesson/level.
  - The system must **reset the lesson attempt** by deleting all stored data for that lesson for that user.

---

## Data to delete (only this one lesson)

Reset applies **only to the lesson that was just finalized with &lt; 60%**. No other lessons, levels, or user data are touched.

### Backend (database)

For the single `lesson_id` in the finalize request only:

- `lesson_activity_results` rows for `(user_id, lesson_id)`
- `user_progress` row for `(user_id, lesson_id)`

### Frontend (local storage)

- Clear **only this lesson’s** progress in localStorage (e.g. `lessonProgressStorage.clearProgress(userId, lessonId)` for the lesson that failed). Do not clear other lessons’ keys or other user data.
- **Do not tie clearing to “Retry Lesson”** — if we only clear when the user clicks Retry, they can close the page, reload, and potentially start a new lesson or see stale state. Instead:
  - **Clear localStorage in the same flow as score calculation, without user input**: as soon as the frontend receives the `finalize-lesson` response with `passed: false` and `reset: true`, clear lesson progress from localStorage in that response handler (e.g. in the modal’s finalize call or wherever finalize is invoked). No button click required.
  - Optional safeguard: when loading a lesson (or dashboard), if the server indicates no progress or `completed: false` for this lesson, clear any localStorage for this lesson so we never restore stale in-progress state.

Optional/depends on product requirements:

- Any “lesson completion” achievements or other derived records that might have been awarded on finalize.
  - Today `finalize-lesson.ts` calls `check_achievements_on_lesson_complete(userId)` regardless of pass/fail.
  - If that procedure can grant achievements for “completion”, we should gate it behind pass, or implement rollback logic.

---

## Backend plan

### A) Make `finalize-lesson` authoritative for completion/pass

Update `functions/finalize-lesson.ts` so that `user_progress.completed` reflects **pass**, not “reached the end”.

- **On pass (`percentage >= 60`)**:
  - Upsert `user_progress` with:
    - `completed = true`
    - `score = totalScore` (or optionally store `percentage` if you prefer)
    - `completed_at = NOW()`
    - `attempts = attempts + 1`
  - Award stars.
  - Check achievements.

- **On fail (`percentage < 60`)**:
  - In a single transaction, delete **only for this lesson** (the `lesson_id` in the request):
    - Delete from `lesson_activity_results` where `user_id = ? AND lesson_id = ?`
    - Delete from `user_progress` where `user_id = ? AND lesson_id = ?`
    - (If needed) rollback any “completion” achievements that were granted incorrectly.
  - Return a clear API response:
    - `success: true` (the finalize call succeeded)
    - `data.passed: false`
    - `data.reset: true`
    - `data.percentage: <calculated>` and a user-friendly message key/code like `LESSON_BELOW_PASS_THRESHOLD_RESET`

Why keep `success: true` on fail?
- The endpoint executed successfully; the “fail” is a business rule outcome that the UI can handle deterministically.

### B) Stop `submit-lesson-activity` from setting “completed”

Because `submit-lesson-activity.ts` cannot compute the final %:

- Remove or neutralize the line that sets:
  - `completed = CASE WHEN isFinalActivity THEN true ...`
- Options:
  - **Preferred**: never set `user_progress.completed` in this endpoint at all; let `finalize-lesson` decide.
  - If you still need an “end reached” flag for UI, introduce a new DB column (e.g. `finished`) instead of overloading `completed`.

### C) Harden `advance-level`

Once `user_progress.completed` truly means “passed”:

- `advance-level.ts` becomes correct automatically (it counts passed lessons only).
- Add a defensive check: if any lesson in the current level is not completed=true, do not advance.

---

## Frontend plan

### A) Block progression in `LessonCompletionModal`

In `src/components/lesson/LessonCompletionModal.tsx`:

- If `percentage < 60`:
  - **Hide/disable** “Continue to Next Lesson”
  - Show only:
    - “Retry Lesson” (primary)
    - “Close” (optional; but returning to dashboard should still show the same lesson as next because DB says not completed)

### B) Reset (DB + localStorage) must happen when we calculate score — no user input

- **Backend** already deletes DB data when `finalize-lesson` runs and `percentage < 60` (see Backend plan). That happens as soon as finalize is called (e.g. when the completion modal opens or when the user finishes the last activity).
- **Frontend**: in the same flow, when the frontend receives the `finalize-lesson` response with `passed: false` and `reset: true`, **immediately** in that response handler:
  - Call `lessonProgressStorage.clearProgress(user.id, lessonId)` (no user click).
  - Show the completion modal with “You need at least 60% to pass. We’ve reset this lesson so you can try again.” and only “Retry Lesson” / “Close” (no “Continue to Next Lesson”).
- **“Retry Lesson”** is only for navigation (back to `/lessons?lessonId=...`). It does **not** trigger the reset; the reset has already happened when we got the finalize response. That way, if the user closes the page without clicking Retry, the next time they open the app the DB and (if they had the tab open long enough to get the response) localStorage are already clean; if we add the optional safeguard above, loading the lesson without server progress will also clear stale localStorage.

---

## Edge cases / concurrency

- **BackgroundSaveQueue still flushing while reset happens**
  - Ensure retry/reset waits for `backgroundSaveQueue.flushImmediate()` (already used in modal) before calling finalize.
  - After a reset, consider clearing or pausing any queued saves tied to that lesson ID to prevent re-inserting deleted rows.

- **User closes modal or tab before/during finalize**
  - DB reset happens on the server when finalize runs with &lt; 60%, so the lesson stays not completed. If the user never got the response, localStorage might still hold old progress; the optional “on lesson load, if server says no progress then clear localStorage” keeps that in sync.

- **Achievements**
  - If the stored procedure can grant achievements for completion, we must only call it on pass, or add rollback.

---

## Verification / test plan

- **Unit-ish (backend)**
  - Finalize with mocked activity results:
    - >=60%: `user_progress.completed=true`, `lesson_activity_results` retained, stars awarded.
    - <60%: both tables deleted for that lesson, response includes `passed=false` and `reset=true`.

- **Integration (happy path)**
  - Complete a lesson with >=60%:
    - Continue works, dashboard shows next lesson.
    - When all lessons passed, `advance-level` updates user level.

- **Integration (failure path)**
  - Complete a lesson with <60%:
    - Modal blocks “Continue”.
    - Clicking “Retry” returns to same lesson.
    - Dashboard does not treat the lesson as completed.
    - `advance-level` does not advance.

