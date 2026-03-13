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

## 2. Keeping the response minimal (save API time and storage)

- **API cost**: Whisper is billed per minute of audio; `verbose_json` does **not** cost more than `json`. We use it only to get segments—there is no smaller format that still gives segment-level data.
- **Minimise by**: (1) **Not** requesting word-level timestamps (`timestamp_granularities: ["word"]` adds latency; segment-level is enough). (2) **Storing only what we need**—trim the API response before writing to the DB.

**Minimal structure to store** (for read vs spontaneous only): top-level `text`, `duration`, `language`; per segment `start`, `end`, `text`, `avg_logprob`, `no_speech_prob`. Omit from segments: `id`, `tokens`, `temperature`, `seek`, and optionally `compression_ratio`. Log a short summary (segment count, duration) in production, not the full raw response.

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

4. **Filler frequency**
   - Count occurrences of "um", "uh", "er", "like" (and optionally "I mean", "actually") in segment text or full transcript.
   - High filler density (e.g. per 100 words) → more spontaneous; low → more read-like.

5. **Speech rate**
   - Overall: `word_count / duration` (use Whisper `duration` or sum of segment spans).
   - Per-segment rate variance: spontaneous tends to fluctuate; read is steadier.

6. **Optional: word-level timestamps**
   - Whisper supports `timestamp_granularities: ["word"]` with `verbose_json` for per-word timings.
   - Could later use syllable/word rhythm (e.g. variance of inter-word intervals) for a finer “read vs speak” signal. Leave for a second iteration.

### Output shape (suggested)

Add to analysis result (e.g. in `result_json` from `run-speech-analysis-background`) or as a separate field:

```json
{
  "delivery": {
    "mode": "read" | "spoken" | "uncertain",
    "confidence": 0.0,
    "signals": {
      "segment_duration_variance": 0.45,
      "pause_ratio": 0.12,
      "filler_ratio": 0.03,
      "speech_rate_wps": 2.1,
      "mean_logprob": -0.29,
      "num_segments": 8
    }
  }
}
```

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
classifier (rules or trained model)
  ↓
read speech / spontaneous speech
```

---

## 5. Implementation steps (summary)

| Step | Task |
|------|------|
| 1 | In **speech-job.ts**: switch to `response_format: 'verbose_json'` (do **not** use `timestamp_granularities: ["word"]`); keep `result.text` for `transcript`; **trim** API response to minimal structure (text, duration, language, segments with start, end, text, avg_logprob, no_speech_prob only); store trimmed object; log short summary (e.g. segment count, duration). |
| 2 | **Migration**: Add `whisper_verbose_json JSONB` to `speech_jobs`; in speech-job, after Whisper, write the **trimmed** minimal structure to this column. |
| 3 | **run-speech-analysis-background.ts**: When loading the job, also select `whisper_verbose_json`. Log `[Whisper transcript]` as today; optionally log a one-line summary of segments (e.g. count, total duration). |
| 4 | **Read-vs-speak util**: New file e.g. `functions/lib/read-vs-speak.ts` (or under `utils/`): input = verbose object (or segments array); output = `{ mode, confidence, signals }` using variance of segment duration, pause ratio, and optionally segment-length stats. |
| 5 | **run-speech-analysis-background.ts**: If `whisper_verbose_json` exists and has `segments`, call the util and merge `delivery` into the result written to `result_json`. |
| 6 | **analysis-result / UI**: Expose `delivery` in the API response and, if desired, show a short message when `mode === 'read'` (e.g. “Try speaking in your own words instead of reading.”). |
| 7 | (Optional) Align **ai-speech-to-text.ts** and **ai-feedback.ts** with `verbose_json` and pass segments forward if we want the same detection in those flows later. |

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
