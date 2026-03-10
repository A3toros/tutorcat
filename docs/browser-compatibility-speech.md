# Browser compatibility: speech recording and analysis

Notes on cross-browser behavior for `getUserMedia`, `MediaRecorder`, uploads, and polling. Use this when debugging or improving the speech flow.

---

## 1. Microphone API (`getUserMedia`)

**Used in app:** `navigator.mediaDevices.getUserMedia({ audio: ... })` in `SpeakingWithFeedback.tsx`, `SpeakingTest.tsx`, `SpeakingImprovement.tsx`, `speakingHelper.ts`.

**Safari**
- Requires **HTTPS** (and secure context). On HTTP, permission can fail or be denied.
- Permission prompts can **fail silently**; user may need to allow in Site Settings.
- Older Safari has limited or buggy `MediaRecorder` support.

**Brave**
- Blocks fingerprinting/tracking by default; **microphone can be blocked**.
- User may need to allow microphone in Brave settings or per-site.

**Typical error:** `NotAllowedError` (permission denied or blocked).

**What we do**
- `iosDetection.ts`: `getAudioConstraints()` uses minimal constraints on iOS (`echoCancellation: true` only) and full constraints elsewhere.
- We check `hasMicPermission` and show errors when recording fails.
- **First-use hint:** When idle, we show “Allow microphone when your browser prompts.” below the record button.
- **NotAllowedError:** We show a specific message: “Microphone access was denied. Allow microphone in your browser or site settings, or try Chrome/Firefox.”
- **Mobile (iOS):** When recording starts on iOS we show “Keep this tab open while recording.” for 4 seconds.

---

## 2. MediaRecorder compatibility

**Used in app:** `MediaRecorder` in the same components; format chosen via `getSupportedMimeType()` from `iosDetection.ts`.

| Browser   | Support   |
|----------|-----------|
| Chrome   | Excellent |
| Firefox  | Excellent |
| Opera    | Good      |
| Brave    | Same as Chrome |
| Safari   | Partial / buggy in older versions |

**Common issues:** Recording fails, empty blob, unsupported codec.

**What we do**
- `getSupportedMimeType()` tries platform-ordered MIME types: on **iOS** we use `audio/mp4` (and AAC) first; on others `audio/webm;codecs=opus` then fallbacks.
- We throw a clear error if no supported type is found (e.g. “MediaRecorder is not fully supported on this iOS version”).
- **Empty blob:** We show “No audio recorded. Please try again. Try Chrome or Firefox if the problem continues.” (non‑iOS); iOS keeps the Safari-specific message.
- **MediaRecorder.onerror:** We show “Recording error. Please try again or use Chrome/Firefox for best support.”

---

## 3. Audio format differences

**Backend:** `speech-job.ts` and `ai-feedback.ts` accept `audio_blob` (base64) and `audio_mime_type`. We map MIME to extension and pass the blob to Whisper (webm, m4a, wav, mp3).

| Browser       | Typical format   |
|---------------|------------------|
| Chrome / Brave| webm (opus)      |
| Firefox       | ogg / webm       |
| Safari        | mp4 / aac        |

**What we do**
- We send the **recorded blob’s type** as `audio_mime_type` and do **no client-side re-encoding**.
- Backend uses the reported type to choose file extension and forwards the buffer to Whisper.
- **Recommendation:** Keep accepting multiple formats; avoid forcing a single format or client-side conversion.

---

## 4. Large uploads (base64 vs multipart)

**Current:** Client sends **base64-encoded audio in JSON** (`audio_blob` string). Body can be large (~33% overhead vs raw binary).

**Risks**
- Very large request bodies can hit limits or timeouts.
- Big base64 strings can increase memory and sometimes trigger “request aborted” in some browsers.

**What we do**
- **speech-job** enforces **max 10 MB** decoded size and **max 120 s** duration; returns 413 with a clear message.
- Frontend should enforce the same limits (2 min, 10 MB) and show “Please speak for less than 2 minutes” to avoid oversized uploads.

**Recommendation (future):**
- Consider **multipart/form-data** upload (audio file as a part, metadata as fields) to avoid base64 overhead and body size issues.
- Keep current JSON/base64 as fallback until multipart is implemented and tested.

---

## 5. Polling (analysis-result)

**Current:** Frontend polls `GET /analysis-result?id=...` every **2 s** until `completed` or `failed`.

**Risks**
- **Background tabs:** Timers (setTimeout/setInterval) are throttled; polling can slow down.
- **Mobile:** Suspend/background can delay or pause requests.
- **Safari:** Background JS is throttled; UI may update late even when analysis is done.

**What we do**
- Single submission request; analysis runs on first poll (or soon after). No long-held request.
- **Visibility-aware polling:** When the tab is visible we poll every 2s; when hidden we poll every 4s to reduce load while throttled. When the user returns to the tab, the next poll (within 2s) fetches the result.
- **Implementation:** `SpeakingWithFeedback` uses `document.visibilityState === 'visible' ? POLL_INTERVAL_MS : POLL_INTERVAL_BACKGROUND_MS` in the poll loop.

---

## 6. CORS and fetch

**Backend:** `speech-job.ts` and `analysis-result.ts` (and other functions) send:

- `Access-Control-Allow-Origin: *`
- `Access-Control-Allow-Headers: Content-Type, Authorization`
- `Access-Control-Allow-Methods: POST, OPTIONS` or `GET, OPTIONS`
- `OPTIONS` returns 200 with empty body.

**Safari / Firefox** can be strict on preflight, custom headers, and cookies.

**Recommendation:** Keep these CORS headers on all speech/API endpoints; if you add cookies or credentials, set `Access-Control-Allow-Origin` to a specific origin and ensure `Credentials` mode matches.

---

## 7. Old browser JavaScript

Older browsers may lack **async/await**, **fetch**, **AbortController**, **ReadableStream**.

**What we do**
- Build pipeline (Next.js/TypeScript) transpiles and targets modern browsers; no legacy polyfills by default.
- **Recommendation:** If you need to support very old devices, add Babel/polyfills and test; for typical “students on modern devices,” current setup is usually enough.

---

## 8. Mobile browser quirks

**iOS Safari**
- Can **pause recording when the screen locks** or app backgrounds.
- Microphone permission can **reset** after updates or long inactivity.
- Background tabs **suspend** scripts; polling may stall.

**Android**
- **Battery saver** can throttle timers and network; polling may be delayed.

**What we do**
- We cap recording at 2 min and show a clear “speak for less than 2 minutes” message.
- **Recommendation:** In UI, suggest keeping the app/tab in foreground during recording and polling; document that locking the screen may stop recording.

---

## 9. Privacy extensions

**Ad blockers, script blockers, privacy shields** (e.g. in Brave, Firefox) can:
- Block API requests.
- Block or interfere with microphone access.

**Recommendation:** If a user reports “no sound” or “request failed” with no server errors, suggest disabling extensions for the site or trying in a clean profile/window. Document in FAQ or help.

---

## Quick reference

| Topic           | Where in codebase                          | Action |
|----------------|--------------------------------------------|--------|
| Mic permission | `SpeakingWithFeedback`, `iosDetection`     | HTTPS, clear errors, optional first-use hint |
| MediaRecorder  | `getSupportedMimeType()`, `iosDetection`   | Platform MIME types; Safari/iOS fallback    |
| Formats        | `speech-job.ts`, `ai-feedback.ts`          | Accept webm/mp4/wav/mp3; no client convert  |
| Large uploads  | 10 MB / 120 s in `speech-job`              | Enforce client-side; consider multipart     |
| Polling        | Frontend poll loop for `analysis-result`   | 2–3 s interval; tolerate background delay    |
| CORS           | All function responses                     | Keep Allow-Origin, -Headers, -Methods        |
| Mobile         | Recording + polling                        | Prefer foreground; document lock-screen     |
| Extensions     | N/A                                        | FAQ: try without blockers                    |

---

## Related files

- **Plans:** `docs/plan-best-architecture-transcription-and-analysis.md`, `docs/plan-long-running-speech-analysis.md`
- **Backend:** `functions/speech-job.ts`, `functions/analysis-result.ts`, `functions/ai-feedback.ts`
- **Frontend:** `src/components/lesson/activities/SpeakingWithFeedback.tsx`, `src/components/evaluation/SpeakingTest.tsx`, `src/utils/iosDetection.ts`, `src/utils/speakingHelper.ts`
