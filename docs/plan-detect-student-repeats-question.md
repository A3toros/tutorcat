## Plan: Detect When Student Repeats the Question (Speaking Tasks)

### Goal

Ensure students actually *answer* the speaking prompt instead of just repeating it. When a student response is essentially a restatement of the original question (e.g. “I am going to answer your question what time do you get up on weekdays and on weekends?”), we treat it as an invalid attempt: **lock the Next button, show a “Re-record” prompt, and ask them to record again**, exactly like we already do for **AI-detected answers** or **answers below the minimum word threshold**.

---

### High-Level Behaviour

- **Input**:  
  - Prompt/question text, e.g. `"What time do you get up on weekdays and on weekends?"`  
  - Student spoken response transcript (from our STT pipeline).

- **Output / Behaviour**:  
  - If the student **repeats or paraphrases the question** instead of answering:
    - Mark the attempt as **invalid_due_to_question_repetition** (new reason code).
    - **Lock Next button** on the speaking UI.
    - Show **“Please re-record your answer instead of repeating the question”** (or similar UX copy).
    - Show the same **Re-record** UI affordance we use for AI detection / too-few-words.
  - Otherwise, continue with our normal flow (word count check, AI detection, feedback, etc.).

---

### Detection Strategy (LLM / GPT-5 Style Judge)

We will use our existing LLM judge pattern (same style as AI detection / rubric scoring) to decide if the student has repeated the question.

- **Core idea**: ask GPT-5 (or current main LLM) something like:
  - “Given the teacher’s question and the student’s answer, decide if the student is *answering* or mostly just *repeating / restating* the question. Return a strict boolean and a short reason.”

- **LLM prompt / output shape (conceptual)**:
  - Input fields:
    - `question`: the exact prompt text.
    - `answer`: the transcript from speech-to-text (normalized).
    - `language_level` / `task_type` (optional, for future tuning).
  - Output JSON:
    - `is_repeating_question: boolean`
    - `repetition_type: "exact" | "partial" | "no"`
    - `reason: string`

- **Detection rules (post-processing)**:
  - If `is_repeating_question === true` → treat as invalid attempt.
  - Optionally add a shallow heuristic sanity check:
    - Very high lexical overlap (e.g. Jaccard similarity above threshold) between question and answer.
    - Answer starts with a meta phrase like “I am going to answer your question…” and then mostly restates the question.
  - If heuristics and LLM disagree, **prefer LLM**, but log disagreements for tuning.

---

### Integration Points in Current TutorCat Flow

Assumptions (align with current codebase patterns – adjust names as needed):

- Speaking analysis currently flows through:
  - `functions/ai-speech-to-text.ts` → transcribe → analyze.
  - `functions/run-speech-analysis-background.ts` → per-prompt background analysis and integrity checks.
  - Frontend speaking UI uses:
    - `integrity` / `validation` fields to decide on **Next** vs **Re-record** behaviour.
    - Existing “AI detected” and “too few words” checks.

**New logic order for each speaking attempt:**

1. We have:
   - `prompt.questionText`
   - `transcript` (student utterance).
2. Normalize text (lowercase, strip punctuation, collapse whitespace, remove filler like “uh/um” if we already do that).
3. **Run “question repetition” detection**:
   - Call `detectQuestionRepetition({ question, answer: transcript })` (new helper).
   - Get `{ is_repeating_question, repetition_type, reason }`.
4. If `is_repeating_question` is true:
   - Set:
     - `validation.rejected: true`
     - `validation.reason: "question_repetition"`
     - `validation.message: "Please answer the question in your own words instead of repeating it. Tap re-record and try again."`
   - **Skip** normal scoring / AI detection for this attempt (or still run in background, but do not advance).
   - Return to frontend with this state so it can **lock Next** and **show Re-record**.
5. Else:
   - Proceed with existing:
     - **minimum words** / duration check.
     - **AI detection** (GPTZero / HF / LLM judge as configured).
     - **pedagogical feedback**.

---

### Frontend UX / State Changes

Reuse the same UI path we already have for **invalid speaking attempts**.

- **New invalid reason**: `question_repetition`.
- **When `validation.reason === "question_repetition"`**:
  - Disable or hide **Next**.
  - Highlight the **Re-record** button (primary action).
  - Show a message like:
    - “It sounds like you repeated the question instead of answering it. Please re-record your answer using your own words.”
  - Optionally show a subtle hint with the question again (to reduce confusion).

- **Analytics / logging**:
  - Track how often this happens per prompt (this may surface badly-written prompts that invite repetition).

---

### Implementation Steps

1. **Create a shared helper `detectQuestionRepetition`**
   - Location: e.g. `functions/lib/question-repetition.ts` (or similar utilities folder).
   - Export:
     - `async detectQuestionRepetition({ question, answer }): Promise<{ is_repeating_question: boolean; repetition_type: "exact" | "partial" | "no"; reason: string }>`
   - Internally:
     - Perform basic normalization.
     - (Optional) Compute lexical overlap / simple similarity score.
     - Call GPT-5 with a strict JSON schema that forces the three output fields.
     - Map/validate the result; on any parsing error, default to `is_repeating_question: false` so we **never block** due to tool failure.

2. **Wire helper into speaking analysis**
   - In `ai-speech-to-text` and/or `run-speech-analysis-background`:
     - After obtaining the final transcript string, call `detectQuestionRepetition`.
     - If it returns `is_repeating_question: true`:
       - Populate the `validation` / `integrity` block accordingly:
         - `validation.rejected = true`
         - `validation.reason = "question_repetition"`
         - `validation.message` as above.
       - Short-circuit the rest of the “advance” logic so the attempt does not count as valid.

3. **Unify with existing invalid-answer logic**
   - Ensure the same frontend code path handles:
     - `reason: "ai_detected"`
     - `reason: "too_few_words"`
     - `reason: "question_repetition"`
   - Confirm that all three:
     - Lock or disable **Next**.
     - Emphasize **Re-record**.
     - Show a contextual message to the student.

4. **Config / Tuning**
   - Add a feature flag (optional) such as `QUESTION_REPETITION_DETECTION_ENABLED`:
     - If false, we skip this detection entirely.
   - Allow tuning of:
     - Similarity threshold for lexical-overlap heuristic.
     - Any temperature / strictness parameters in the GPT-5 prompt.

5. **Testing**
   - Create a small set of test cases:
     - **Clearly repeated**:
       - “I am going to answer your question what time do you get up on weekdays and on weekends?”
       - Exact or near-exact readback of the question.
     - **Good answers**:
       - “On weekdays I get up at 7, but on weekends I usually sleep until 9.”
     - **Edge cases**:
       - Student briefly echoes part of the question, then answers (“You asked what time I get up; I usually get up at 7…” → should be accepted).
   - For each test, assert:
     - Correct `is_repeating_question`, `repetition_type`, and `validation.reason`.
     - Correct UI behaviour: Next locked vs enabled, Re-record visibility.

---

### Copy Suggestions (UX Text)

- **Error message** (question repetition):
  - “It sounds like you repeated the question instead of answering it. Please re-record your answer using your own words.”


