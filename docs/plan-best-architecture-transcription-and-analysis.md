# Best Architecture: Transcription + Poll-to-Run Analysis (One Request)

**One request from the browser; no workers, no queues, minimal infrastructure.**  
Critical: **do not send the transcript back to the browser** before analysis. The backend transcribes, stores the transcript, and returns a job id. Analysis runs when the frontend **first polls** for the result.

---

## Critical improvement: transcript stays on the backend

**Do not** have the browser receive the transcript and then call a second endpoint to submit it.

**Bad (two requests):**
```
Browser → transcribe-audio → Browser receives transcript → Browser → submit-analysis → jobId
```
This creates:
- **Extra network roundtrip**
- **Client manipulation risk** (transcript could be altered before analysis)
- **Extra latency**

**Good (one request):**
```
Browser → POST /speech-job → backend gets transcript → backend immediately creates job → returns jobId
```
Transcript never touches the client until it’s part of the final result (if you choose to show it). One request instead of two.

---

## Best optimized pipeline

**Workload:** ~1 minute speech → short transcription (~3–8s) → ~2–4 second analysis.  
So the cleanest architecture is **no workers, no queues** — run analysis on the first poll.

```
Browser
  ↓
POST /speech-job  (audio + metadata)
  ↓
Backend: transcribe (Whisper)
  ↓
Backend: store transcript in DB, status = processing
  ↓
Backend: return { jobId }
  ↓
GET /analysis-result?id=123  (frontend polls)
  ↓
First poll: if status == processing → set analyzing → run analysis → store result → completed/failed
  ↓
Subsequent polls: return current status/result
```

**One request from the browser; analysis runs inside the poll handler, not in a separate worker.**

---

## Why this works best

- **One request from browser** – Audio goes to `/speech-job`; backend transcribes, stores transcript, returns `jobId`. No transcript roundtrip.
- **Transcript never sent to client** until needed (e.g. in the final result for display). Reduces manipulation and extra latency.
- **No workers or queues** – Analysis runs in the first poll request (~2–4s). Minimal infrastructure.
- **No long-held submission request** – POST only does transcribe + store; returns quickly. Poll handler does the short analysis.
- **No timeout risk** – Submission is transcribe-only; analysis is a short step inside the poll endpoint.

---

## Step 1 – Submit speech job (single request)

**POST** `/speech-job` (or `/.netlify/functions/speech-job`)

- **Body:** Audio blob (e.g. base64) + metadata (`prompt`, `promptId`, `cefr_level`, etc.).
- **Backend:**
  1. **Validate request limits** (see "Request limits" below): reject if audio size &gt; 10 MB or duration &gt; 120 s.
  2. Forward audio to OpenAI Whisper → get transcript.
  3. Insert row in `speech_jobs` with `transcript`, `status: 'processing'`, and metadata.
  4. Return **immediately**:

```json
{ "jobId": "123", "status": "processing" }
```

- **No analysis in this request.** Transcription typically ~3–8s. Analysis runs when the client first polls (see Step 2).

---

## Request limits for POST /speech-job

**Enforce limits so users cannot upload extremely large files.**

| Rule | Limit | Action if exceeded |
|------|--------|---------------------|
| **max_audio_size** | 10 MB | Reject request (e.g. 413 or 400). |
| **max_duration** | 120 s (2 min) | Reject request. |

- **Backend:** Before calling Whisper, check request body size (and optionally audio duration if you can derive it). If over limit, return an error (e.g. `400` or `413`) with a clear message so the frontend can show it.
- **Frontend / UI:** When limit is exceeded (or before recording), tell the user: *"Please speak for less than 2 minutes"* (and optionally show max size, e.g. "Max 10 MB"). Consider client-side checks (e.g. stop recording at 2 min, or warn when file would exceed 10 MB) to avoid unnecessary uploads.

Without these limits, someone could upload very large files and stress the backend and Whisper.

---

## Step 2 – Poll for result (first poll runs analysis)

**GET** `/analysis-result?id=123` (or `/.netlify/functions/analysis-result?id=123`)

- Frontend polls every **2s**.
- **Handler logic — important safeguard:** prevent multiple polls from running analysis at once.

  Use a temporary status so only one request does the work:

  ```
  if status == 'processing':
    update row: status = 'analyzing'   (atomic)
    run analysis (same logic as ai-feedback)
    update row: result_json or error, status = 'completed' or 'failed'
  return current status + result/error
  ```

  If two polls hit at the same time, only one can transition `processing → analyzing`; the other sees `analyzing` or `completed` and just returns.

- **Status flow:** `processing` → `analyzing` → `completed` or `failed`.
- Response: `{ "status": "processing" }` or `{ "status": "analyzing" }` while in progress; when done `{ "status": "completed", "result": { ... } }` or `{ "status": "failed", "error": "..." }`.
- Optionally include `transcript` in the result for display or retry.

---

## Store the transcript with the job

**Important:** Persist the transcript on the job row.

**Why:**

- **Debugging** – Inspect what was actually sent to the analyzer.
- **Retry analysis** – Re-run analysis without re-uploading audio (e.g. "Retry Analysis" uses same transcript).
- **Audit trail** – Know what was evaluated for a given job.

### Example table: `speech_jobs`

| Column       | Type    | Purpose |
|-------------|---------|---------|
| `id`        | uuid/pk | Job id returned to client. |
| `user_id`   | uuid    | Optional; for scoping and cleanup. |
| `transcript`| text    | Input text sent to analysis. |
| `status`    | text    | `processing` \| `analyzing` \| `completed` \| `failed`. |
| `result_json`| jsonb  | Full analysis result when completed. |
| `error`     | text    | Error message when failed. |
| `created_at`| timestamptz | When job was created. |
| `updated_at`| timestamptz | When status/result was last updated. |

Optional: `prompt`, `prompt_id`, `cefr_level` if you want to filter or display per job.

---

## Implementation checklist

- [ ] **DB:** Create `speech_jobs` table with `id`, `user_id`, `transcript`, `status` (`processing` \| `analyzing` \| `completed` \| `failed`), `result_json`, `error`, `created_at`, `updated_at`.
- [ ] **POST /speech-job:** Enforce request limits (max 10 MB, max 120 s duration); reject with clear error if exceeded. Accept audio + metadata → Call Whisper → get transcript → insert row with `transcript`, `status: 'processing'` → return `{ jobId, status: 'processing' }`. No analysis, no worker.
- [ ] **GET /analysis-result:** If `status == 'processing'`, atomically update to `'analyzing'`, run analysis (same logic as `ai-feedback`), write `result_json` or `error` and set `status: 'completed'` or `'failed'`. Return current `{ status, result? }` or `{ status, error? }`; optionally include `transcript`. This prevents multiple concurrent polls from running analysis (only one wins the `processing → analyzing` transition).
- [ ] **Frontend:** Enforce or warn: max duration 2 min, max size 10 MB; show "Please speak for less than 2 minutes" when limit exceeded. After recording → POST audio to `/speech-job` once → receive `jobId` → poll `/analysis-result?id=jobId` every 2s until completed/failed → show result or error.
- [ ] **Retry:** "Retry Analysis" can create a new job from the stored `transcript` (e.g. POST to an endpoint that accepts `transcript` + metadata and inserts a new row with `status: 'processing'`) so no re-upload of audio.

---

## References

- Plan: [Long-running speech analysis](plan-long-running-speech-analysis.md) (Options 2 and 3A; this doc uses poll-to-run instead of a separate worker).
- [Browser compatibility (speech recording & analysis)](browser-compatibility-speech.md) – Safari, Brave, MediaRecorder, formats, uploads, polling, CORS, mobile.
- Existing: `ai-feedback` (text-in analysis), `ai-speech-to-text` (current single-call flow).
