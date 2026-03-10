# Plan: Long-Running Speech Analysis (Avoid Timeouts)

## Goal

Speech analysis (transcription + OpenAI feedback) can take **30–45+ seconds**. Netlify serverless functions have a **30s default timeout** (up to 26s on some plans). The frontend receives **500 / timeout** before the backend finishes, so the UI stays in loading and the user sees an error even when the job would have succeeded.

We want to either:

- Let the function run longer (background), or  
- Return immediately and let the client poll for results.

---

## Option 1: Background Functions (Netlify-native)

Netlify supports **background functions** that run up to **15 minutes**. The HTTP response returns quickly with a 202; the function keeps running in the background.

### Backend

- **Instead of:** `/.netlify/functions/ai-feedback` (or `ai-speech-to-text`) as a normal function  
- **Create:** `/.netlify/functions/ai-feedback-background` (and/or `ai-speech-to-text-background`)

**Example shape:**

```ts
// functions/ai-feedback-background.ts
import type { Handler } from '@netlify/functions';
import { runFeedbackAnalysis } from './ai-feedback'; // or inline the logic

export const config = {
  // Background: response returns immediately; function can run up to 15 min
  background: true,
};

export const handler: Handler = async (event) => {
  const body = JSON.parse(event.body || '{}');
  const result = await runFeedbackAnalysis(body); // your existing analysis
  return { statusCode: 200, body: JSON.stringify(result) };
};
```

- Call the **same URL** from the frontend (e.g. `POST /.netlify/functions/ai-feedback-background`).
- Netlify returns **202 Accepted** immediately; the function continues running.
- **Caveat:** The client does **not** get the result in the initial HTTP response. So either:
  - Netlify supports a way to send the result back (e.g. callback URL, or the client must poll), or  
  - This fits better when you **don’t** need to return the result in the same request (e.g. fire-and-forget, or you combine with Option 2).

**Check Netlify docs:** Background functions may still require a **callback** or **polling** to get the result back to the user. Confirm whether "background" only means "no timeout" or also "how does the client get the result?"

### Good for

- Long OpenAI calls  
- Transcription  
- Any single long analysis task where you can either callback or poll for the result

---

## Option 2: Return Early + Poll (Job queue)

Do **not** wait for the AI response inside the same request. Return immediately with a job id; the client polls for the result.

### Flow

1. **User submits speech**  
   - Frontend: `POST /.netlify/functions/submit-speech` with audio (or transcript) and metadata.

2. **Backend stores a job and returns immediately**  
   - Create a row in DB (e.g. `speech_jobs`: `id`, `user_id`, `status`, `payload`, `result`, `created_at`).  
   - Start processing **asynchronously** (same function continues in background, or a separate function is triggered).  
   - Response:  
     `{ "status": "processing", "jobId": "123" }`  
   - Return within a few seconds (e.g. 200 with `jobId`).

3. **Frontend polls for result**  
   - `GET /.netlify/functions/speech-result?jobId=123`  
   - Backend reads `speech_jobs` for `jobId`, returns `{ status: "completed", result: { ... } }` or `{ status: "processing" }` or `{ status: "failed", error: "..." }`.  
   - Frontend polls every 2–3s until `status === "completed"` or `failed` / timeout.

### Backend pieces

| Piece | Purpose |
|-------|--------|
| `submit-speech` | Accept audio/transcript, create job, enqueue or start processing, return `jobId`. |
| `speech-result` | Return job status + result for a given `jobId`. |
| Job processing | Either inside `submit-speech` after responding (e.g. `waitUntil`-style), or a separate background/cron that processes pending jobs. |
| DB table | e.g. `speech_jobs` (id, user_id, status, input, result, error, created_at, updated_at). |

### Good for

- Avoiding timeouts entirely (no long-held HTTP connection).  
- Very common pattern for AI/transcription pipelines.  
- Retries and observability (job history in DB).

---

## Recommendation

- **Option 1 (background):** Use if Netlify gives a clear way to get the result back to the client (e.g. WebSocket, callback URL, or built-in "return result to same client" for background). If the client cannot get the result in the same "session", combine with a small job id + poll.
- **Option 2 (return early + poll):** Use when you want a reliable, timeout-free flow and are okay adding a job table and polling endpoint. Fits existing "submit → poll for result" AI architectures.

---

## Implementation checklist (Option 2)

- [ ] Add `speech_jobs` (or similar) table in Supabase/DB.  
- [ ] Implement `submit-speech`: validate input, create job, start async work, return `{ status: "processing", jobId }`.  
- [ ] Implement `speech-result`: GET by jobId, return status + result or error.  
- [ ] Move current analysis logic into a shared path that runs when processing the job (from submit-speech or a worker).  
- [ ] Frontend: after submit, show "Analyzing…" and poll `speech-result` every 2–3s until completed/failed; then show result or error.  
- [ ] Optional: expiry/cleanup for old jobs.

---

## Option 3: Safe architecture for transcription

**Goal:** Keep the API key on the server and avoid heavy backend work. Split transcription (proxy) from analysis (text-only).

### 3A. Backend proxy (recommended safe flow)

Audio never goes to your “analyzer”; only text does. A **thin proxy** handles transcription.

**Flow:**

```
Browser
  ↓ (audio blob)
Backend proxy
  ↓
OpenAI transcription (Whisper)
  ↓
Backend proxy
  ↓ (text only)
Browser
```

The backend (e.g. on Netlify) does **only**:

1. Receive the audio (from the browser).
2. Forward it to OpenAI Whisper.
3. Return the transcript (text) to the browser.

This proxy does almost **no computation** (no analysis, no prompt building, no second OpenAI call). It just forwards the request and response. So it rarely hits resource limits and is less likely to timeout than a function that does transcription + feedback in one go.

**Then:** The browser sends the **text only** to your analyzer endpoint (e.g. `ai-feedback` with `transcription`). The analyzer runs on small JSON only; no audio.

**Implementation:**

- Add a small function, e.g. `transcribe-audio` or `whisper-proxy`: accepts `POST` with audio blob (or base64), calls OpenAI `audio.transcriptions.create`, returns `{ transcript: "..." }`.
- Frontend: (1) Record audio → (2) `POST` audio to the proxy → (3) Get transcript → (4) `POST` transcript to `ai-feedback`. Two requests; backend never does transcription and analysis in the same function.

### 3B. Client-side transcription (no transcript function)

The **only** way to have **no** Netlify function for transcript: do transcription in the browser.

- **Web Speech API** – built-in, no API key; quality varies.
- **Client-side Whisper** (e.g. Transformers.js / WASM) – better quality; heavier bundle and CPU.

Flow: Browser records → Browser transcribes → Browser sends **text only** to `ai-feedback`. No proxy, no transcript function.

Use when you want zero server-side transcription and accept tradeoffs (quality, bundle size, or browser support).

### What you already have

- **`ai-feedback`** accepts **transcription-only** requests (no `audio_blob`). So “browser sends text → backend analyzes” already works (e.g. “Retry Analysis”).
- **`ai-speech-to-text`** does transcription + feedback in one call. Option 3A replaces that with: proxy (audio → text) + `ai-feedback` (text → feedback).

### Implementation checklist (Option 3A – proxy)

- [ ] Add `transcribe-audio` (or `whisper-proxy`): receive audio, forward to OpenAI Whisper, return `{ transcript }`.
- [ ] Frontend: after recording, call the proxy to get transcript, then call `ai-feedback` with that transcript.
- [ ] Optional: keep `ai-speech-to-text` as a single-call fallback or remove it once the two-step flow is default.

---

## References

- Netlify: [Background functions](https://docs.netlify.com/functions/background-functions/)  
- Existing long-running handlers: `ai-feedback`, `ai-speech-to-text` (currently subject to 30s timeout; `netlify.toml` sets 45s for deploy where supported).
