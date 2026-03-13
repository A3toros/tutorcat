# Plan: Whisper Verbose Output & Read vs Speak Detection

## Goal

1. **Get full Whisper output** – not just `text`, but `segments` with timing and confidence so we can log/debug and use it for delivery analysis.
2. **Detect if the student is reading** (e.g. from a script) **vs speaking** (spontaneous) – to encourage genuine speaking and optionally flag or give feedback.

---

## 1. Whisper verbose response format

### Current behaviour

- We use `response_format: 'json'`, which returns only: `{ "text": "..." }`.
- So we only store and see the flat transcript string.

### Desired behaviour

- Use **`response_format: 'verbose_json'`** so the API returns:

```json
{
  "text": "Are you going to have a birthday party this year? Yes, I'm definitely going to...",
  "language": "en",
  "duration": 12.5,
  "segments": [
    {
      "id": 0,
      "start": 0.0,
      "end": 3.2,
      "text": " Are you going to have a birthday party this year?",
      "avg_logprob": -0.31,
      "compression_ratio": 1.2,
      "no_speech_prob": 0.02,
      "temperature": 0.0,
      "tokens": []
    },
    {
      "id": 1,
      "start": 3.2,
      "end": 7.1,
      "text": " Yes, I'm definitely going to have a birthday party this year",
      "avg_logprob": -0.28,
      "compression_ratio": 1.15,
      "no_speech_prob": 0.01,
      "temperature": 0.0,
      "tokens": []
    }
  ]
}
```

- **Where to change**: `functions/speech-job.ts` (primary path for recording → analysis). Optionally align `ai-speech-to-text.ts` and `ai-feedback.ts` if they also need segments later.
- **Type**: With `verbose_json`, the SDK may still type the result as a simple object; we can cast or extend the type to include `segments`, `duration`, `language` and use them downstream.

### What Whisper actually outputs

Whisper produces:

- **Transcription** – full `text` and per-segment `text`
- **Timestamps** – `start` / `end` per segment (and optionally per word with `timestamp_granularities`)
- **Token / decoding probabilities** – `avg_logprob`, `compression_ratio`, `no_speech_prob` per segment
- **Language detection** – `language` (and optionally `duration` in verbose mode)

Example output structure:

```json
{
  "text": "...",
  "segments": [
    {
      "start": 0.0,
      "end": 3.2,
      "text": "Today I want to talk about...",
      "avg_logprob": -0.31,
      "compression_ratio": 1.2,
      "no_speech_prob": 0.02
    }
  ]
}
```

These signals can help estimate **speech naturalness** (read vs spontaneous).

---

## 2. Keeping the response minimal (save time / latency)

- **Latency**: We care about **time**, not billing. We use `verbose_json` only because we need segments—there is no smaller format that still returns segment-level data. The same model run produces the result; we just get more fields back.
- **Minimise by**: (1) **Not** requesting word-level timestamps—`timestamp_granularities: ["word"]` adds extra latency; segment-level is enough for pauses and speech rate. (2) **Storing only what we need**—trim the API response before writing to the DB (smaller payload, less to process downstream).

**Minimal structure to store** (for read vs spontaneous only): top-level `text`, `duration`, `language`; per segment `start`, `end`, `text`, `avg_logprob`, `no_speech_prob`, `compression_ratio`. Omit from segments: `id`, `tokens`, `temperature`, `seek`. Log a short summary (segment count, duration) in production, not the full raw response.

---

## 3. Storing the minimal output

### Option A (recommended): New column on `speech_jobs`

- Add **`whisper_verbose_json JSONB`** to `speech_jobs`.
- In `speech-job.ts` after Whisper:
  - Keep using `result.text` for the existing `transcript` column (so analysis and UI unchanged).
  - Build and store **only the minimal structure above** (trimmed from the API response) in `whisper_verbose_json`.
- Pros: Clear separation of “raw Whisper” vs “analysis result”; easy to query/debug; no change to existing `result_json` semantics.
- Migration: one new column, nullable, no backfill required.

### Option B: Store only in analysis result

- In `run-speech-analysis-background.ts`, we don’t have the raw Whisper response today (we only get `transcript` from the DB). So we’d need to either:
  - Pass segments from `speech-job` into the background function (e.g. store in DB first, then read in background), or
  - Re-call Whisper with `verbose_json` in the background (extra cost and latency).
- So for read-vs-speak we need the verbose response stored somewhere; Option A is the natural place.

### Logging

- Log a short summary (e.g. segment count, duration) rather than the full raw response; or a truncated `[Whisper raw output]` for debugging.

---

## 4. Read vs speak detection (using segments)

### Intuition

- **Reading**: Often more even pacing, fewer mid-sentence pauses, possibly more fluent (fewer hesitations), more uniform segment lengths.
- **Spontaneous speech**: More pauses, fillers, restarts, uneven segment lengths and gaps.

### What we need from Whisper

For read vs spontaneous detection, we use these signals (all derivable from Whisper `verbose_json`):

1. **Filled pauses ("um", "uh", etc.)**  
   Count filler words in the transcript. Spontaneous speech has more.

2. **Avg. sentence length**  
   Words per sentence (from segment or full text). Read speech tends to have longer, well-formed sentences.

3. **Transcript confidence**  
   Whisper’s per-segment **`avg_logprob`** (mean log-probability of tokens) and **`compression_ratio`** (signal of transcription difficulty). Lower `avg_logprob` or higher `compression_ratio` often indicate disfluent or spontaneous speech.

4. **No-speech probability**  
   Whisper’s **`no_speech_prob`** (likelihood the segment was silence). High values may hint at long pauses.

5. **Perplexity proxy**  
   Not directly available from Whisper; one could use Whisper’s logprobs or pass transcripts through a small language model. For simplicity, the above metrics suffice.

So we need from Whisper: **`text`** (full + per segment for fillers and sentence length), **`start`/`end`** (pauses, duration), **`avg_logprob`**, **`compression_ratio`**, **`no_speech_prob`** per segment. Store these in the minimal structure (include `compression_ratio` in stored segments).

### Signals that indicate spontaneous vs read speech

| Spontaneous speech usually has | Read speech usually has |
|--------------------------------|-------------------------|
| **Fillers** – "uh", "um", "like" | Smooth grammar |
| **Self-corrections** – "I mean… actually…" | Fewer fillers |
| **Pauses** – longer gaps | Steady pace |
| **False starts** – restarting sentences | Fewer corrections |
| **Irregular grammar** – spoken fragments | More uniform phrasing |

### Signals you can extract from Whisper

| Signal | How to get it | Interpretation |
|--------|----------------|-----------------|
| **Filler frequency** | Count "um", "uh", "er", "like" in segment `text` (or full transcript) | High filler density → more spontaneous. |
| **Pause duration** | From segment timestamps: `pause = next_segment.start - current_segment.end` | Large pauses often indicate thinking / spontaneity. |
| **Perplexity / confidence** | Per segment: `avg_logprob`, `compression_ratio` | Spontaneous speech tends to have lower ASR confidence and more decoding uncertainty. |
| **Speech rate** | `words / duration` (total or per segment); can use segment lengths and timestamps | Spontaneous speech tends to fluctuate; read speech is often more steady. |

### Segment-level fields we get from Whisper (reference)

| Field               | Meaning (short)                    | Use for read vs speak                    |
|---------------------|------------------------------------|------------------------------------------|
| `start`, `end`      | Timestamp (seconds)                | Segment duration, gaps between segments  |
| `text`              | Text of segment                    | Optional: filler words, repetition       |
| `avg_logprob`       | Average log-probability (confidence) | Higher (closer to 0) = more confident  |
| `compression_ratio` | Whisper’s compression ratio       | Often used for hallucination; may help   |
| `no_speech_prob`    | Probability of “no speech”         | High = pause/silence; useful for rhythm   |

### Proposed heuristics (implement in code)

1. **Pacing uniformity**
   - Compute segment durations: `duration_i = end_i - start_i`.
   - **Variance (or std dev) of segment duration**: Low variance → more “read-like”; high variance → more “spontaneous”.
   - Optional: exclude very short segments (e.g. &lt; 0.5 s) or treat them as pauses.

2. **Pause frequency / silence**
   - For each segment, use `no_speech_prob` (or gap between `segment[i].end` and `segment[i+1].start`).
   - Count “pause” segments (e.g. `no_speech_prob > 0.5` or gap &gt; 0.3 s).
   - **Reading**: often fewer mid-sentence pauses. **Speaking**: more pauses and hesitations.
   - Metric: e.g. `pause_count / num_segments` or total pause time / total duration.

3. **Segment length distribution**
   - Reading might show more similar segment lengths (similar number of words per chunk).
   - Spontaneous might show a mix of long runs and short fragments (fillers, “um”, restarts).
   - Simple version: std dev of “words per segment” or of segment duration.

4. **Filler frequency (filled pauses)**
   - Count occurrences of "um", "uh", "er", "like" (and optionally "I mean", "actually") in segment text or full transcript.
   - High filler density (e.g. per 100 words) → more spontaneous; low → more read-like.

5. **Avg. sentence length**
   - Words per sentence (split full transcript or segment text on sentence boundaries; approximate with clauses or segment boundaries if needed). Read speech tends to have longer, well-formed sentences; spontaneous often shorter or fragmentary.

6. **Speech rate**
   - Overall: `word_count / duration` (use Whisper `duration` or sum of segment spans).
   - Per-segment rate variance: spontaneous tends to fluctuate; read is steadier.

7. **Optional: word-level timestamps**
   - Whisper supports `timestamp_granularities: ["word"]` with `verbose_json` for per-word timings.
   - Could later use syllable/word rhythm (e.g. variance of inter-word intervals) for a finer “read vs speak” signal. Leave for a second iteration.

### Output shape (suggested)

Add to analysis result (e.g. in `result_json` from `run-speech-analysis-background`) or as a separate field:

```json
{
  "delivery": {
    "spoken_pct": 85,
    "mode": "read" | "spoken" | "uncertain",
    "confidence": 0.0,
    "signals": {
      "segment_duration_variance": 0.45,
      "pause_ratio": 0.12,
      "filler_ratio": 0.03,
      "speech_rate_wps": 2.1,
      "mean_logprob": -0.29,
      "mean_compression_ratio": 1.18,
      "avg_sentence_length": 12,
      "num_segments": 8
    }
  }
}
```

- **spoken_pct**: 0–100. **Probability that the response was spoken (spontaneous) vs read.** High = allow; low = prompt re-record. Frontend uses a threshold (e.g. 70): if `spoken_pct < 70` show “Please speak in your own words instead of reading. Re-record your answer.” and block progression.
- **mode**: `"read"` = likely reading; `"spoken"` = likely spontaneous; `"uncertain"` = not enough signal or conflicting.
- **confidence**: 0–1; how strong the classification is.
- **signals**: Raw metrics so we can tune thresholds and debug.

### Where to compute

- **Preferred**: In **`run-speech-analysis-background.ts`** (or a small shared util it imports).
  - Read `whisper_verbose_json` from the job row (after we store it in `speech_jobs`).
  - If present, compute the heuristics above, then set `delivery` in the object we write to `result_json` (or merge into feedback).
- Alternative: Compute in `speech-job.ts` and store a small `delivery` object in the job row or in a separate column; then background only reads it. Either way, we need segments available where we compute (so storing verbose in DB is required).

### Accuracy expectations

With **Whisper signals alone** (fillers, pauses, logprob, speech rate, etc.):

| Task | Typical accuracy |
|------|------------------|
| Read vs spontaneous | ~65–75% |

To improve accuracy, combine with **acoustic features** (see below).

### Better approach (recommended)

Combine Whisper with an **audio feature extractor** such as **OpenSMILE**.

Acoustic features include:

- Pitch variation
- Speaking rate (from audio, not just transcript)
- Hesitation duration
- Prosody patterns

Then train a classifier (e.g. read vs spontaneous).

Rough expectations:

| System | Accuracy |
|--------|----------|
| Whisper signals only | ~70% |
| Whisper + acoustic features (e.g. OpenSMILE) | ~85% |

So: start with Whisper-only for a first version; plan a second phase with acoustic features if we need higher accuracy.

### Comparison: our methods vs browser-side rhythm analysis

| Method | What we use | Expected accuracy (read vs spontaneous) | Notes |
|--------|-------------|----------------------------------------|-------|
| **Whisper only** (server) | Fillers, pauses, segment variance, speech rate, avg_logprob from `verbose_json` | **~65–75%** | Well-supported by literature; no extra runtime beyond Whisper. |
| **Whisper + OpenSMILE** (server, e.g. background function) | Whisper signals + pitch, prosody, hesitation, etc. from OpenSMILE | **~85%** | Best accuracy; needs server-side OpenSMILE (or similar) and training. |
| **Whisper + browser-side rhythm** | Whisper signals + Web Audio features (pitch, energy, pauses, timing) in one classifier | **~72–80% (estimate)** | Above Whisper-only; below Whisper+OpenSMILE. No server-side OpenSMILE. |
| **Browser-side rhythm only** (Web Audio API) | Pitch variance, energy over time, pause locations, simple timing/rhythm from AnalyserNode / FFT | **~55–70% (estimate)** | Fewer and coarser features than OpenSMILE; no transcript-based cues (fillers, logprob). Research suggests rhythm alone distinguishes read vs spontaneous but is noisier for spontaneous speech; browser features are a subset of what OpenSMILE provides, so accuracy is likely **similar to or below Whisper-only**, unless we combine **browser rhythm + Whisper** (then we’d expect something between Whisper-only and Whisper+OpenSMILE). |

**Takeaway**: **Whisper + OpenSMILE** (~85%) > **Whisper + browser rhythm** (~72–80%) > **Whisper-only** (~65–75%) > **browser rhythm only** (~55–70%). **Whisper + browser rhythm** gives a modest accuracy gain over Whisper-only without server-side OpenSMILE.

### Using OpenSMILE when audio is recorded in the browser

We **do not** run OpenSMILE in the browser. Flow:

1. **Browser** records audio (MediaRecorder) and sends it to our API (e.g. base64 in `speech-job`).
2. **Server** receives the same audio file we already use for Whisper.
3. **OpenSMILE** (or another acoustic extractor) would run **on the server** on that audio file, before or after Whisper.

So the audio is already on the server; the only question is **where** we run OpenSMILE:

- **Netlify functions**: Serverless, short timeouts, no persistent filesystem. Running the OpenSMILE **binary** (C++) in a regular function is awkward (binary size, native deps). Not ideal for the main request path.
- **Options**:
  - **Netlify background function as worker**: Use a **background function** (e.g. `run-acoustic-features-background.ts`) that gets invoked with `jobId` (and audio bytes or a storage URL). It can run up to **15 minutes** and returns 202 immediately, so it fits heavy work. Flow: (1) speech-job does Whisper, stores job; (2) we invoke the background function with `jobId`; (3) background function loads audio (from DB/storage or receives in body), writes to `/tmp`, runs OpenSMILE (e.g. via **Python** runtime with the `opensmile` package, or Node + `child_process` to a bundled binary if we can fit it), reads feature vector; (4) writes features to the job row (e.g. `acoustic_features_json`) or passes them to the analysis background. **Catch**: the function runtime must be able to run OpenSMILE—Python background functions with `opensmile` are plausible; bundling the C++ OpenSMILE binary may hit size/deployment limits. If it fits, we keep everything on Netlify without a separate VPS.
  - **Other dedicated worker/service**: A small service (e.g. Node or Python on a VPS, or a long-running Lambda) that receives the audio URL or bytes, runs OpenSMILE, returns a feature vector. Our Netlify function would call this service and merge acoustic features with Whisper features.
  - **Acoustic features in the browser**: Use the **Web Audio API** (or a lightweight JS library) to compute simple acoustic features in the browser (e.g. pitch variance, energy over time, pause locations). Send these features along with the audio (or in a follow-up request). No OpenSMILE on server; we only need a small JSON of numbers. Accuracy may be lower than full OpenSMILE but avoids server-side binary dependency.
  - **Node/WASM on server**: If a JavaScript or WebAssembly port of an acoustic feature extractor exists, we could run it inside the Netlify function. Less common than OpenSMILE; would need research.

**Recommendation**: Start with Whisper-only (no OpenSMILE). For phase 2, either (1) add a **Netlify background function** that runs OpenSMILE (e.g. Python + `opensmile` package) and writes acoustic features to the job, or (2) a separate **backend service** (VPS/Lambda), or (3) **browser-side** acoustic features (Web Audio) sent with the request.

### How we train the classifier

1. **Labels**: We need examples labeled “read” vs “spontaneous”.
   - **Option A**: In-app feedback (e.g. “Was this read from a script?” or “Rate how natural this was”) after submission; store with `job_id`.
   - **Option B**: Internal labeling: staff listen to stored audio and tag read/spontaneous.
   - **Option C**: Synthetic: record known read vs spontaneous samples (e.g. read a paragraph vs answer ad-lib) and use as training set.

2. **Features**: For each labeled sample, extract the same features we use at inference:
   - Whisper: fillers, pause ratio, segment duration variance, speech rate, avg_logprob (from stored `whisper_verbose_json`).
   - Optional: acoustic features (OpenSMILE or browser-computed) if we added that path.

3. **Training**: Offline, not in the app.
   - Use Python (e.g. Jupyter, Colab, or a script): load labeled data, compute feature matrix, train a model (e.g. **logistic regression** or small **MLP** in scikit-learn).
   - Validate with a holdout set; tune thresholds.

4. **Export and use in production**:
   - **Simple model (e.g. logistic regression)**: Export coefficients and intercept to JSON; in Node, compute the same features and apply `1 / (1 + exp(-(dot(coefficients, features) + intercept)))` for probability; threshold for read vs spontaneous.
   - **Heavier model**: Export to ONNX or similar and run inference in Node (e.g. `onnxruntime-node`) or call a small Python inference service.

So: **training is offline** (Python, labeled data, export coefficients or model); **inference is in our backend** (Node) using the same feature computation we implement for the pipeline.

### Classifier: LightGBM / XGBoost

**Why use them**: Gradient boosting (LightGBM, XGBoost) works well on **tabular features** (our Whisper + optional acoustic signals). They often outperform logistic regression when we have enough labeled data and non-linear boundaries.

**How we use them**:
- **Train** in Python (e.g. `lightgbm` or `xgboost` package) on the same feature matrix (filler ratio, pause ratio, mean_logprob, compression_ratio, avg sentence length, etc.). Binary target: read vs spontaneous.
- **Export** the model for use in our backend:
  - **ONNX**: Convert the trained model to ONNX (e.g. `onnxmltools` for LightGBM/XGBoost). Our features are all **numerical**, so we avoid ONNX expansion issues that can increase latency when many categoricals are used. Run inference in Node with **`onnxruntime-node`**: load the ONNX file once (or at cold start), call `session.run()` with the feature vector; typically **sub‑millisecond to a few ms** per prediction in the same process. No extra service or network hop.
  - **Native Node**: For XGBoost, the **`xgboost`** npm package (native bindings) can load a saved model and run `predict()` in Node without ONNX; similar latency.
- **Where it runs**: Inside **`run-speech-analysis-background.ts`** (or the read-vs-speak util): after we compute the feature vector from `whisper_verbose_json`, we call the classifier (ONNX or native) and attach the result to `delivery`. Runs in the same Netlify function, so no extra HTTP call.

**Latency**:
- **In-process (ONNX or native in Node)**: Adds only **~1–5 ms** (or less) per request. Our bottleneck remains Whisper and GPT feedback, not the classifier.
- **Python microservice**: If we instead called a separate service that loads LightGBM/XGBoost and runs `predict()`, we’d pay network RTT + cold start. Not needed if we deploy via ONNX/native in Node.
- **Recommendation**: Use **LightGBM or XGBoost** for better accuracy when we have labels; **export to ONNX** and run with **`onnxruntime-node`** in the background function for low latency. Start with rule-based or logistic regression; switch to a small tree model once we have enough labeled data.

### Example pipeline

```
audio
  ↓
Whisper transcription (verbose_json)
  ↓
extract features
  • filler words (from segment text)
  • pauses (segment timestamps)
  • speaking rate (words / duration)
  • logprob / compression_ratio (per segment)
  • (optional) acoustic features via OpenSMILE
  ↓
classifier (rules, logistic regression, or LightGBM/XGBoost via ONNX in Node)
  ↓
read speech / spontaneous speech
```

### Your final architecture (correct approach)

**Input audio → extract three signal groups, then one classifier.**

---

**1️⃣ Browser rhythm features (JS)**

Fast features computed in the browser (Web Audio API or similar):

- Pause length (avg, variance)
- Speech rate (words/sec)
- Energy variation
- Pitch variance

**Example feature vector:**

| Feature | Example value |
|--------|----------------|
| speech_rate | 3.1 words/sec |
| avg_pause | 0.42 sec |
| pause_variance | 0.30 |
| pitch_variance | 18.2 |
| energy_variance | 0.22 |

**Latency:** &lt;50 ms (browser-side).

---

**2️⃣ Whisper text features**

From the transcription (server, after Whisper `verbose_json`):

- Sentence length (avg)
- Repetition patterns
- Filler words (rate)
- Grammar regularity (score)

**Example:**

| Feature | Example value |
|--------|----------------|
| avg_sentence_len | 12.4 |
| grammar_score | 0.93 |
| filler_word_rate | 0.08 |

**Latency:** 1–2 s (Whisper).

---

**3️⃣ Classifier**

Classifier takes **all features together** (browser + Whisper) and predicts:

- **reading** vs **spontaneous speech**

**Example combined feature vector (order for model input):**

```
[
  speech_rate,
  pause_variance,
  pitch_variance,
  energy_variance,
  avg_pause,
  avg_sentence_len,
  filler_rate,
  grammar_score
]
```

- **Browser** sends rhythm features with the request (or in a follow-up); **server** has Whisper text features from `whisper_verbose_json`. Server (or a small util) concatenates into one vector and runs the classifier (rules, logistic regression, or LightGBM/XGBoost via ONNX).

---

## 5. Implementation steps (summary)

| Step | Task |
|------|------|
| 1 | In **speech-job.ts**: switch to `response_format: 'verbose_json'` (do **not** use `timestamp_granularities: ["word"]`); keep `result.text` for `transcript`; **trim** API response to minimal structure (text, duration, language, segments with start, end, text, avg_logprob, no_speech_prob, compression_ratio); store trimmed object; log short summary (e.g. segment count, duration). |
| 2 | **Migration**: Add `whisper_verbose_json JSONB` to `speech_jobs`; in speech-job, after Whisper, write the **trimmed** minimal structure to this column. |
| 3 | **run-speech-analysis-background.ts**: When loading the job, also select `whisper_verbose_json`. Log `[Whisper transcript]` as today; optionally log a one-line summary of segments (e.g. count, total duration). |
| 4 | **Read-vs-speak util**: New file e.g. `functions/lib/read-vs-speak.ts` (or under `utils/`): input = verbose object (or segments array); output = `{ mode, confidence, signals }` using variance of segment duration, pause ratio, and optionally segment-length stats. |
| 5 | **run-speech-analysis-background.ts**: If `whisper_verbose_json` exists and has `segments`, call the util and merge `delivery` into the result written to `result_json`. |
| 6 | **analysis-result / UI**: Expose `delivery` in the API response and, if desired, show a short message when `mode === 'read'` (e.g. “Try speaking in your own words instead of reading.”). |
| 7 | (Optional) Align **ai-speech-to-text.ts** and **ai-feedback.ts** with `verbose_json` and pass segments forward if we want the same detection in those flows later. |

---

## 5.1. Current status & TODO (classifier deferred)

**Current behaviour:** The classifier is not yet trained. We treat **all** responses as **spoken** so the API and UI can rely on a stable `delivery` shape. In `run-speech-analysis-background.ts`, after parsing feedback we set `spoken_pct: 100` (and `mode: 'spoken'`) so no re-record is ever prompted until the real classifier is wired. Frontend: if `delivery.spoken_pct < 70` (configurable threshold), we block progression and show “Please speak in your own words instead of reading. Re-record your answer.”

**To-do list (when we have enough data):**

| # | Task | Notes |
|---|------|--------|
| 1 | **Store Whisper verbose** | Add `whisper_verbose_json` to `speech_jobs`; in speech-job use `verbose_json`, trim and store minimal structure (see §3, §5). |
| 2 | **Collect labeled data** | Store audio + `whisper_verbose_json` (and optional browser rhythm). Label read vs spontaneous (in-app feedback, internal tagging, or synthetic samples). |
| 3 | **Train classifier** | When enough labels: extract features (fillers, pause ratio, segment variance, logprob, etc.); train in Python (e.g. LightGBM/XGBoost); export to ONNX or coefficients. |
| 4 | **Wire real classifier** | Add `functions/lib/read-vs-speak.ts`: compute features from `whisper_verbose_json`, run classifier, return `{ mode, confidence, signals }`. In background function, call it and set `feedback.delivery` from result instead of stub. |
| 5 | **(Optional) Browser rhythm** | Collect Web Audio features with submissions; add to feature vector and retrain for higher accuracy. |

Until then, no read-vs-speak logic runs; every response is treated as spoken.

---

## 6. Files to touch

- **functions/speech-job.ts**: `response_format: 'verbose_json'` (no word-level timestamps); trim response to minimal structure; store in `whisper_verbose_json`; keep `transcript = result.text`.
- **supabase/migrations/**: New migration adding `whisper_verbose_json JSONB` to `speech_jobs`.
- **functions/run-speech-analysis-background.ts**: SELECT `whisper_verbose_json`; call read-vs-speak util; merge `delivery` into result.
- **functions/lib/read-vs-speak.ts** (or **utils/read-vs-speak.ts**): Pure function `computeDeliveryMode(verbose: WhisperVerbose): DeliveryResult`.
- **functions/analysis-result.ts**: Ensure `result_json` (which may now include `delivery`) is returned to client as-is.
- **Frontend** (optional): Show a message or flag when `result.delivery?.mode === 'read'`.

---

## 7. Thresholds (tuning)

- Start with **conservative thresholds** so we rarely falsely accuse someone of reading (e.g. require high confidence and clear “read” signals).
- Log `delivery` and `signals` for a while; then adjust:
  - **segment_duration_variance**: e.g. below 0.3 → more read-like; above 0.6 → more spoken.
  - **pause_ratio**: e.g. below 0.1 → read-like; above 0.2 → spoken-like.
- Can later add a small ML model or more rules (e.g. using `avg_logprob` or `compression_ratio`) once we have data.

---

## 8. References

- [OpenAI Audio API – verbose_json](https://platform.openai.com/docs/api-reference/audio/verbose-json-object)
- Whisper response: `text`, `language`, `duration`, `segments[]` with `start`, `end`, `text`, `avg_logprob`, `compression_ratio`, `no_speech_prob`, etc.
- Optional: `timestamp_granularities: ["word"]` for word-level timestamps in a later phase.
- LightGBM/XGBoost in Node: export to ONNX (e.g. [onnxmltools](https://github.com/onnx/onnxmltools)), run with [onnxruntime-node](https://www.npmjs.com/package/onnxruntime-node); or [xgboost-node](https://github.com/nuanio/xgboost-node) for native XGBoost in Node.
