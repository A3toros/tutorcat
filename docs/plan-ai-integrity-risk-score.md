# Plan: AI Integrity Risk Score (Level mismatch + Off-syllabus vocab + Robotic cues)

## Goal

Add a **server-side** “AI integrity” check for student free-text (writing + any future typed speaking / short answers) that computes a **risk score** from:

- **Level mismatch** (text is far above the expected CEFR level)
- **Off‑syllabus vocabulary** (too many words outside lesson/unit target vocab)
- **Robotic cues** (LLM-ish stylistic signals)

If the risk score is high, the API returns a **flagged** result and the UI shows:

> “Your answer was flagged for using AI. Please try again using your own words.”

This is **not** a perfect detector; it’s a **friction + consistency** mechanism that leans on course context (level + target vocab) rather than generic “AI %”.

---

## Where this fits in this codebase

### Existing relevant pieces

- `functions/get-lesson.ts` returns lesson activities including `vocabulary_items` (from `vocabulary_items` table) and lesson `level` (CEFR-like, e.g. A1/A2/B1…).
- `src/components/evaluation/WritingTest.tsx` currently does **word-count-only** scoring and does not call AI.
- `functions/ai-feedback.ts` and `functions/improve-transcription.ts` already contain **level-aware** logic (min words per CEFR, assessed_level in JSON, etc.), but they focus on **speaking** / transcription feedback.

### Proposed integration points (incremental)

**Constraint:** Do not add new backend endpoints. Use the **existing** AI backend flow and only adjust the **prompt + returned JSON shape**.

- **Phase 1 (fastest):** Extend the existing `/.netlify/functions/ai-feedback` flow (specifically the `"text_analysis"` path) so it returns:
  - `integrity.flagged` (boolean)
  - `integrity.risk_score` (0–100)
  - `integrity.signals` (level mismatch, off‑syllabus vocab, robotic cues)
  - and, when flagged, a user-facing `integrity.message` (e.g. “Your answer was flagged…”)
- **Phase 2:** Wire `WritingTest` to call the **same** `ai-feedback` endpoint (type `"text_analysis"`) and block/force resubmit when `integrity.flagged === true`.
- **Phase 3:** Store integrity results in DB (or `lesson_activity_results.feedback`) so repeated flags can be audited and tuned.

---

## API design (server) — reuse existing endpoint

### Endpoint

`POST /.netlify/functions/ai-feedback`

### Request body

```json
{
  "type": "text_analysis",
  "content": "string",
  "context": {
    "prompt": "optional string",
    "language": "en",
    "level": "A1|A2|B1|B2|C1|C2",
    "lesson_id": "optional",
    "activity_type": "optional",
    "target_vocab": ["today", "yesterday", "tomorrow"]
  }
}
```

### Response body

```json
{
  "success": true,
  "feedback": {
    "comments": "string",
    "score": 0,
    "integrity": {
      "flagged": false,
      "risk_score": 0,
      "signals": {
        "level_mismatch": { "score": 0, "details": {} },
        "off_syllabus_vocab": { "score": 0, "details": {} },
        "robotic_cues": { "score": 0, "details": {} }
      },
      "message": "optional user-facing string"
    }
  }
}
```

### Blocking rule

- If `integrity.risk_score >= 60` → `integrity.flagged: true` and UI blocks/forces resubmit.
- If `risk_score in [40, 59]` → **warn** (optional): ask for a rewrite with 2 personal details, or ask 1–2 follow-up questions.
- If `< 40` → allow.

---

## Signal 1: Level mismatch (expected CEFR vs actual difficulty)

### Inputs

- `text`
- expected `cefr_level` (from lesson/test settings; lesson is available via `get-lesson.ts`)

### Heuristics (no AI model required)

Compute a `level_mismatch.score` from features like:

- **Sentence length**: average tokens per sentence, max sentence length
- **Clause depth proxies**: counts of conjunctions/subordinators (because/although/which/that/if/unless/whereas…)
- **Vocabulary rarity proxy**:
  - word length distribution
  - proportion of words not in a simple whitelist for the level (start with target vocab + a small “common words” list per CEFR; expand later)
- **Punctuation/structure**: presence of essay-like scaffolding (“Firstly”, “Moreover”, “In conclusion”)

### Optional: LLM-as-judge (more accurate, higher cost)

If you accept model usage here, you can ask the model to output:

- `assessed_level` (Pre-A1..C2)
- `confidence`

Then compute mismatch as a function of distance between assessed vs expected.

**Important:** Use this as one signal among others; do not treat it as ground truth.

---

## Signal 2: Off‑syllabus vocabulary

### Inputs

- `target_vocab` for the lesson/prompt
  - Source: `functions/get-lesson.ts` already returns `vocabulary_items` per activity.
  - Build a lesson-level target list by aggregating all `vocabulary_items.english_word` for the lesson.
- `text`

### Heuristics

- Tokenize + normalize (lowercase, strip punctuation).
- Compute:
  - **coverage**: % of target vocab used at least once
  - **off_syllabus_ratio**: % of content words not in (target vocab ∪ common words for level)
  - **advanced_word_burst**: count of rare/academic connectors (moreover, furthermore, consequently, nevertheless…)

Scoring idea:

- If `coverage` is very low **and** `off_syllabus_ratio` is high → strong signal.
- If `coverage` is low but text is short → reduce penalty (avoid punishing brevity twice).

---

## Signal 3: Robotic cues

### Inputs

- `text`

### Heuristics (style-only; low confidence)

Flag patterns that often appear in LLM output (but keep weight modest to reduce false positives):

- High density of **formal discourse markers**:
  - “Moreover”, “Furthermore”, “In conclusion”, “It is important to note”, “Overall”
- Symmetric paragraphing / templated structure:
  - “First… Second… Third…”
- Generic, non-specific claims:
  - “This demonstrates that…”, “There are many reasons…”
- Low personal grounding (no concrete nouns, times, places) when the prompt expects it

Score this as a light additive signal (e.g. max 20–25 points) unless paired with the other two signals.

---

## Risk score aggregation

Start simple and tune later:

\[
\text{risk} = 0.45 \cdot \text{levelMismatch} + 0.35 \cdot \text{offSyllabus} + 0.20 \cdot \text{robotic}
\]

Where each component is in 0–100.

Add guardrails to reduce false positives:

- If `text` is very short (< 30 words), cap `robotic_cues.score`.
- If target vocab list is missing/empty, down-weight `off_syllabus_vocab`.

---

## Data needs / storage

### Minimal (Phase 1)

- No DB changes required.
- The UI calls `ai-integrity` before accepting submission.

### Better (Phase 3)

Store per-attempt integrity results:

- `lesson_activity_results.feedback.integrity` (JSON) OR a new table `integrity_checks`
  - `user_id`, `lesson_id`, `activity_id`, `risk_score`, `flagged`, `signals`, `created_at`

This allows:

- auditing false positives
- adaptive thresholds per level
- detecting sudden “writing quality jumps” per user (change-detection)

---

## UI behavior (WritingTest first)

In `src/components/evaluation/WritingTest.tsx` (or a shared submit handler):

- Before `onComplete`, call `/.netlify/functions/ai-feedback` with `type: "text_analysis"` and `context.level` + (optionally) `context.target_vocab`.
- If `result.feedback.integrity.flagged === true`:
  - show a blocking message and keep the student on the same prompt
  - optionally require “rewrite using 2 personal details” (reduces generic AI output)

---

## Implementation order

1. Update `functions/ai-feedback.ts` (text-analysis path) prompt + JSON schema to include `feedback.integrity`.
2. Ensure `src/utils/aiFeedbackHelper.ts` keeps unknown fields (it already returns `...result`) so `integrity` can flow through.
3. Wire `WritingTest` to call `ai-feedback` (type `"text_analysis"`) before finalizing each prompt or before full submission.
4. Tune thresholds per CEFR level (A1 more sensitive to “advanced connectors”).
5. Optional: add DB logging and admin dashboard view.

---

## Notes on “preventing AI”

- This approach **won’t stop** motivated cheating, but it:
  - catches obvious pasted high-level English in A1/A2
  - aligns grading with lesson vocabulary goals
  - nudges students toward producing personal, level-appropriate language

