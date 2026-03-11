# Plan: Fix “Improved transcript” (Speaking) combining + display

## Problem summary

Current behavior often shows an “improved transcript” that is:
- **Just one prompt’s** improved text (sometimes the first prompt).
- Or a **raw concatenation** of multiple prompt answers, sometimes cut mid-thought.

Root causes (current code paths):
- `SpeakingWithFeedback` **overwrites** `answers.improvedTranscript` after each prompt with that prompt’s `result.improved_transcript`, so the activity can end up with a **single-prompt** improved text unless the user reaches “Complete”.
- The combined generation (`/.netlify/functions/improve-transcription`) receives `text: allTranscripts.join(' ')` with **no segment boundaries** and no explicit `segmentCount`, so the model can “improve” only the start.
- If combine fails, fallback runs `condenseTextForLevel()` on a concatenation; due to word limits it effectively returns the **first segment only**.
- `SpeakingImprovement` can load from `speech_jobs` and uses the **latest job’s** `result.improved_transcript` (single prompt), which is not a combined summary.

## Why the combine API fails (and we fall back)

The combine step is the call from `SpeakingWithFeedback` to `/.netlify/functions/improve-transcription`. When that request fails, `generateCombinedImprovedVersion()` falls back to concatenating per-prompt improved transcripts (or raw transcripts) and then condensing, which often yields “prompt 1 only”.

Common failure modes to expect:
- **Network / transient fetch failure**: student loses connection; request is aborted; mobile backgrounding.
- **Function error (non-2xx)**:
  - Missing/invalid `OPENAI_API_KEY`.
  - OpenAI API error (rate limit, timeout, upstream 5xx).
  - JSON parsing error for request body.
- **Response parsing error in the client**:
  - Client does `const responseText = await response.text(); JSON.parse(responseText);`
  - If the function returns HTML (Netlify error page) or non-JSON, JSON.parse throws and triggers fallback.
- **Long inputs**:
  - Combined `text` can be large; model may return malformed output; function may exceed time or token constraints.

How to confirm which failure is happening (recommended diagnostics):
- In `SpeakingWithFeedback.tsx`, log `response.status`, and log the first ~200 chars of `responseText` when JSON.parse fails (dev only).
- In `functions/improve-transcription.ts`, log structured error info (OpenAI error type/status) and include a concise `error_code` in JSON responses.

Outcome: we can distinguish “combine failed due to network” vs “function returned non-JSON” vs “OpenAI error”, and only then decide whether to retry, show “Try again”, or use a safe merge fallback.

## Goals

- **Combined improved transcript** should be a short, coherent paragraph summarizing ALL prompt answers (within CEFR word band).
- **Per-prompt improved transcript** should still exist, but must not overwrite the combined summary.
- Display logic should **prefer the combined** summary and only fall back to per-prompt/last job when truly necessary.
- Never cut the combined summary mid-sentence.

## Non-goals

- Changing speaking prompts content or lesson structure.
- Reworking `speech_jobs` schema (should be solvable at application level).

## Implementation plan

### 1) Stop overwriting the combined field during per-prompt analysis

File: `src/components/lesson/activities/SpeakingWithFeedback.tsx`

Current: after each prompt analysis we store:
- `answers.improvedTranscripts[promptId] = result.improved_transcript`
- **and** `answers.improvedTranscript = result.improved_transcript` (overwrites combined)

Fix:
- Keep storing per-prompt improved text in `answers.improvedTranscripts[promptId]`.
- Do **not** write `answers.improvedTranscript` here.
- Instead add/keep a separate field for the “last prompt” if needed, e.g. `answers.lastImprovedTranscript`.

Outcome: `answers.improvedTranscript` becomes reserved for the **combined** summary only.

### 2) Make combined generation robust: segment boundaries + segmentCount

Files:
- `src/components/lesson/activities/SpeakingWithFeedback.tsx`
- `functions/improve-transcription.ts`

Frontend changes:
- Build combined input as explicit segments, e.g.:
  - `text = prompts.map((p,i) => \`[Prompt ${i+1}] ${promptText}\\n[Answer ${i+1}] ${transcript}\`).join('\\n\\n')`
  - (or at minimum `allTranscripts.map((t,i)=>\`[Answer ${i+1}] ${t}\`).join('\\n\\n')`)
- Send `segmentCount = lessonData.prompts.length` (or `allTranscripts.length` with a guard that they match).
- Send `maxWords` (already in place) and optionally `minWords`.

Backend changes (`improve-transcription.ts`):
- Accept `segmentCount?: number`.
- When `segmentCount > 1`, add explicit hard instructions:
  - Must use content from **all N answers**.
  - Must not output only the first answer.
  - Must produce 1 short paragraph, within word band.
- Keep server-side enforcement to **trim to last full sentence** if model exceeds max words.

Outcome: combine step reliably produces a merged short summary across all prompts.

### 3) Fix fallback to avoid “first prompt only”

File: `src/components/lesson/activities/SpeakingWithFeedback.tsx`

Current fallback:
- concatenate per-prompt improved transcripts, then condense → returns earliest content.

Fix fallback strategy:
- Prefer “best-of-all” summary even without the combine API:
  - Take **one short sentence per prompt** (or first sentence) from `feedback[promptId].improved_transcript` (ordered by prompt index), then merge and condense.
  - Alternatively: if combine fails, show a clear “Try again” action instead of storing a misleading combined text.

Outcome: fallback won’t misleadingly show only the first prompt’s content.

### 4) Make `SpeakingImprovement` prefer combined sources

File: `src/components/lesson/activities/SpeakingImprovement.tsx`

Fix precedence order (best → worst):
1. `lesson_activity_results.answers.improvedTranscript` (combined) via `get-lesson` load.
2. LocalStorage `answers.improvedTranscript` for the speaking activity (combined).
3. If only per-prompt exists: merge `answers.improvedTranscripts` into a short summary (client-side) and display that.
4. **Avoid** using latest `speech_jobs.result.improved_transcript` as “combined” (it’s single prompt). If used at all, label it as “Latest prompt improvement”, not “Combined”.

Also fix “first key” bug:
- `answers.improvedTranscripts?.[Object.keys(...)[0]]` selects the first key arbitrarily; instead order by prompt index (`prompt-0..n`) and merge.

Outcome: improvement step consistently shows the combined summary.

### 5) Add guardrails + diagnostics (dev only)

Files:
- `SpeakingWithFeedback.tsx` (Complete handler)
- `improve-transcription.ts` (logs)

Add checks:
- On complete: verify `Object.keys(transcripts).length === lessonData.prompts.length`. If not, block complete with a user-facing message and/or retry missing prompts.
- Log: segmentCount, maxWords/minWords, and a small preview of input segment headers.

Outcome: prevents generating a “combined” summary from partial data.

## Testing checklist

- Complete a 5-prompt speaking activity:
  - Combined improved transcript is **1 paragraph** and draws from all prompts.
  - Word count within CEFR band (A1/A2 <= 40, B1/B2 <= 60, C1/C2 <= 80).
  - No mid-sentence truncation.
- Force improve-transcription failure (simulate 500) and confirm fallback still produces a short merged summary (not just prompt 1).
- Reload page:
  - `SpeakingImprovement` still shows the combined summary (from DB or localStorage).
- Confirm per-prompt improved transcripts remain available in expanded details/admin views.

## Admin tool: “Test improved transcript” (uses existing backend)

Goal: give admins/devs a fast way to validate the combined improvement logic without recording audio.

### UX
- Add a small button in admin (e.g. on `/admin/transcripts` header) called **“Test”**.
- Clicking opens a new page, e.g. `/admin/improve-transcript-test`.
- The page shows **3 random A1 prompts** (text only) and a textarea under each where an admin can **paste a transcript**.
- A single **“Generate improved transcript”** button sends all pasted answers to the existing backend and displays:
  - Combined improved transcript (one short paragraph)
  - Word count + expected band (A1/A2: 0–40)
  - Any backend error message if generation fails

### Data source for “3 random A1 prompts”
Prefer no new backend endpoints. Options:
- **Option A (fastest):** ship a small hardcoded list of A1 prompt strings in the test page and pick 3 random.
- **Option B (still existing backend):** call existing lesson endpoint(s) (e.g. `get-lessons-by-level` then `get-lesson`) to fetch A1 lesson speaking prompts and pick 3 random.

### Backend usage (no new function)
- Use `/.netlify/functions/improve-transcription` only.
- Request body should include:
  - `text`: structured segments (e.g. `[Prompt 1] ... [Answer 1] ...` etc.)
  - `level: 'A1'`
  - `maxWords: 40`
  - `segmentCount: 3` (after we implement it; until then, still send segmented text with boundaries)

### Expected outcome
- This test tool makes it obvious whether the combined improvement is:
  - merging all answers,
  - staying within word limit,
  - and not silently falling back to “prompt 1 only”.

