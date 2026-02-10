# Plan: iOS / Old iPhone Audio Recording Improvements

**Goal:** Fix "No audio recorded" and unreliable recording on older iPhones (e.g. iPhone 10, iPhone 11) where Safari’s MediaRecorder often delivers empty chunks.

**Context:** The app already detects iOS via `isIOSDevice` (e.g. `/iPad|iPhone|iPod/.test(navigator.userAgent)` or `(navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)`). This plan uses that detection to apply iOS-specific behavior.

---

## 1. Call `requestData()` Before Every `stop()`

**Problem:** On Safari/iOS, the recorder may not flush buffered audio into `ondataavailable` until you request it. If we only call `stop()`, the final chunk can be missing and the blob built from `chunks` is empty.

**Plan:**
- In every flow that stops the recorder, call `mediaRecorder.requestData()` immediately before `mediaRecorder.stop()`.
- **Files to update:**
  - `src/components/lesson/activities/SpeakingWithFeedback.tsx` — in `stopRecording` (and anywhere else that calls `.stop()`).
  - `src/components/lesson/activities/SpeakingImprovement.tsx` — in the path that calls `mediaRecorderRef.current.stop()`.
  - `src/app/lessons/page.tsx` (Warmup) — in `stopRecording` and in the 60s auto-stop timeout.
  - `src/app/evaluation/page.tsx` (SpeakingQuestion) — in `confirmStopRecording` and in the 60s timeout / interval that calls `.stop()`.
  - `src/components/evaluation/SpeakingTest.tsx` — in `confirmStopRecording` and in the 60s auto-stop timeout.
- **Note:** Some places already call `requestData()` before `stop()`; audit all and ensure it is **always** done (including on error/cleanup paths if they call `stop()`).

---

## 2. Use a Timeslice When Starting the Recorder on iOS

**Problem:** On Safari, using `mediaRecorder.start()` with no timeslice can mean data is only emitted at stop, which is unreliable on older devices. Using `start(timeslice)` forces periodic chunks.

**Plan:**
- Where we currently call `mediaRecorder.start()` with no argument, add a branch for iOS:
  - **If `isIOSDevice`:** call `mediaRecorder.start(1000)` (or 500–2000 ms) so the browser emits data every N ms.
  - **Else:** keep `mediaRecorder.start()` as-is.
- **Files to update:** Same as in §1 — every component that creates a `MediaRecorder` and calls `.start()` (SpeakingWithFeedback, SpeakingImprovement, lessons Warmup, evaluation SpeakingQuestion, SpeakingTest).
- **Caveat:** Verify that the backend and upload logic accept multiple chunks or a single final blob; with timeslice we may get several `ondataavailable` events, and we still build one blob from `chunksRef.current` in `onstop`, which is fine.

---

## 3. Keep / Harden iOS-Friendly Format and Options

**Problem:** Old Safari can fail or produce no data if the format isn’t supported.

**Plan:**
- We already prefer `audio/mp4` / `audio/mp4;codecs=mp4a.40.2` on iOS in several places. Ensure **all** recording flows use the same iOS detection and the same format choice (e.g. via a shared helper like `getSupportedMimeType()`).
- Use minimal recorder options on iOS (e.g. only `mimeType`, no `audioBitsPerSecond`) where we already do; avoid adding options that older Safari doesn’t support.
- **Files to check:** All of the above + any shared `getSupportedMimeType()` or equivalent in `src` so behavior is consistent.

---

## 4. Optional: Minimum Recording Duration (iOS)

**Problem:** Very short recordings on old iOS are more likely to yield no data.

**Plan:**
- **If** we want an extra safeguard: when `onstop` runs and we’re on iOS and the blob is empty, check recording duration (e.g. from a timestamp set at `start()`).
  - If duration &lt; ~1 second, show a friendly message: “Please hold and speak for at least 1–2 seconds, then stop,” and don’t treat it as a generic “No audio recorded” error.
- This can be a follow-up after §1 and §2 are in place.

---

## 5. Clearer User Message When Blob Is Empty (Especially on iOS)

**Problem:** “No audio recorded. Please try again.” doesn’t hint that the issue is common on older phones.

**Plan:**
- When we detect empty blob (`audioBlob.size === 0`) and `isIOSDevice`, show a message that suggests:
  - Speaking a bit longer (e.g. 1–2 seconds) before stopping.
  - Using a supported browser (e.g. Safari) and allowing microphone access.
- Keep the same message for non‑iOS, or a single message that covers both if we don’t want to branch.
- **Files to update:** The three places that set “No audio recorded” (SpeakingWithFeedback, SpeakingImprovement, lessons Warmup).

---

## 6. Optional: Retry or Single Re-request on Empty (iOS)

**Problem:** Sometimes one more request for data before stop could help.

**Plan:**
- **Only if needed after §1–2:** In `onstop`, when `chunksRef.current` is empty (or blob size is 0) and we’re on iOS, we could try calling `requestData()` and then `stop()` again **only if** the recorder is still in a state that allows it (and we haven’t already cleared the ref). This is tricky (state machine) and should be a last resort; prefer §1 and §2 first.

---

## Implementation Order

1. **§1 — requestData() before stop()** in all recording flows (highest impact, low risk).
2. **§2 — start(timeslice) on iOS** everywhere we call `mediaRecorder.start()`.
3. **§3 — Audit** iOS format and options for consistency.
4. **§5 — Message** when blob is empty (optionally iOS-specific).
5. **§4 and §6** only if issues persist on iPhone 10/11 after the above.

---

## Files Summary

| Area                         | File(s)                                                                 |
|-----------------------------|-------------------------------------------------------------------------|
| Lesson speaking             | `src/components/lesson/activities/SpeakingWithFeedback.tsx`            |
| Lesson improvement (speaking) | `src/components/lesson/activities/SpeakingImprovement.tsx`          |
| Lesson warmup               | `src/app/lessons/page.tsx`                                             |
| Evaluation single question  | `src/app/evaluation/page.tsx`                                          |
| Evaluation multi-prompt    | `src/components/evaluation/SpeakingTest.tsx`                          |

Use existing `isIOSDevice` (or equivalent) in each file so all changes are gated by current iPhone/iOS detection.
