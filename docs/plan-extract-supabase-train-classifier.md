# Plan: Extract from Supabase, Feed to Classifier, and Train (Read vs Speak)

## Goal

We now have **audio** and **logs** in Supabase (following [plan-supabase-writer-background-call](plan-supabase-writer-background-call.md) and the Browser rhythm + Whisper features from [plan-whisper-verbose-and-read-vs-speak](plan-whisper-verbose-and-read-vs-speak.md)). This document describes how to **extract** that data, **feed** it into a read-vs-speak classifier pipeline, and **train** the classifier so we can replace the current stub `delivery.spoken_pct: 100` with a real prediction.

---

## 1. What we have in Supabase

**Bucket:** `tutorcat` (Storage).

| Object pattern | Written by | Contents |
|----------------|------------|----------|
| `{jobId}.{ext}` | `speech-job.ts` | Raw audio (e.g. `.webm`, `.mp4`). |
| `{jobId}.features.JSON` | `speech-job.ts` | Sidecar: `jobId`, `whisper_verbose`, `browser_rhythm`, `created_at`. |
| `{jobId}.JSON` | `run-speech-analysis-background.ts` | Result log: `jobId`, `status`, `result_json`, `delivery`, `error?`, `written_at`. |

### 1.1 Features payload (`{jobId}.features.JSON`)

- **whisper_verbose** (minimal): `text`, `duration`, `language`, `segments[]` with per-segment `start`, `end`, `text`, `avg_logprob`, `no_speech_prob`, `compression_ratio`.
- **browser_rhythm**: `speech_rate`, `pause_variance`, `pause_entropy`, `pitch_variance`, `energy_variance`, `voiced_ratio` (from Web Audio in `SpeakingWithFeedback.tsx`).

### 1.2 Result log (`{jobId}.JSON`)

- **result_json**: Full feedback (scores, corrections, integrity, etc.).
- **delivery**: Currently stub `{ spoken_pct: 100, mode: 'spoken', confidence: 0, signals: {}, _note: 'Classifier not yet trained' }`.

---

## 2. Flow (extract → feed → train)

```
Supabase Storage (tutorcat)
  ├── list objects: *.features.JSON, *.JSON, and matching audio
  ├── download per jobId: features + result (+ optional audio)
  ↓
Extract & flatten
  ├── Whisper-derived: fillers, pause ratio, segment variance, speech rate, mean_logprob, compression_ratio, avg_sentence_len, etc.
  ├── Browser rhythm: speech_rate, pause_variance, pause_entropy, pitch_variance, energy_variance, voiced_ratio
  ├── Optional: label (from manual tagging or synthetic set)
  ↓
Feature matrix (rows = jobs, columns = features)
  ↓
Train (offline, Python)
  ├── Labels: read vs spontaneous (see §4)
  ├── Model: logistic regression → LightGBM/XGBoost when enough data
  ├── Export: coefficients JSON or ONNX
  ↓
Production: run-speech-analysis-background (or read-vs-speak util) loads model, computes same features, predicts delivery.spoken_pct / mode
```

---

## 3. Extract from Supabase

### 3.1 List and match objects

- List bucket `tutorcat` for objects with keys matching:
  - `*.features.JSON` → primary source of Whisper + browser_rhythm.
  - `*.JSON` (exclude `*.features.JSON`) → result logs (optional for training; useful for debugging and for any future labels stored in result).
  - Audio: same base name with extensions `.webm`, `.mp4`, `.ogg`, etc.
- Derive `jobId` from object key (e.g. strip `.features.JSON` or `.JSON` or extension).

### 3.2 Download per job

- For each `jobId`:
  - Download `{jobId}.features.JSON` (required for features).
  - Optionally download `{jobId}.JSON` (for status, delivery stub, or future labels).
  - Optionally download `{jobId}.{ext}` (for acoustic feature extraction, e.g. OpenSMILE, in a later phase).

### 3.3 Implementation options

| Option | Description |
|--------|-------------|
| **Script (Node or Python)** | Use Supabase Storage API: list objects in bucket, then download by path. Env: `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Store outputs to local dirs, e.g. `data/features/`, `data/results/`, `data/audio/`. |
| **One-off export** | Supabase Dashboard → Storage → select bucket → bulk download or use a small script that writes to CSV/JSONL (jobId, path_to_features, path_to_audio, path_to_result). |
| **Scheduled dump** | Optional: nightly job (e.g. Netlify scheduled function or cron) that lists new objects and appends to a manifest file in the bucket or in a table for later batch download. |

### 3.4 Output of “extract” step

A **manifest** or **local layout** that supports the next step, e.g.:

- **manifest.jsonl**: one line per job: `{ "jobId": "...", "features_path": "...", "result_path": "...", "audio_path": "..." }`.
- Or a **directory layout**: `data/by_job/{jobId}/features.json`, `data/by_job/{jobId}/result.json`, `data/by_job/{jobId}/audio.webm`.

---

## 4. Feed to classifier (feature extraction)

Build the **same** feature vector we will use at inference (so training and production share the same semantics).

### 4.1 From `whisper_verbose` (in features JSON)

Compute per job (aligned with [plan-whisper-verbose-and-read-vs-speak](plan-whisper-verbose-and-read-vs-speak.md)):

| Feature | How to compute |
|---------|----------------|
| **filler_ratio** | Count "um", "uh", "er", "like" in segment texts (or full text) / word count. |
| **pause_ratio** | Sum of gaps between segments (next.start - curr.end) / duration; or count segments with no_speech_prob > threshold. |
| **segment_duration_variance** | Variance of (end - start) across segments. |
| **speech_rate_wps** | word_count / duration (from whisper_verbose.duration or sum of segment spans). |
| **mean_logprob** | Mean of segment `avg_logprob`. |
| **mean_compression_ratio** | Mean of segment `compression_ratio`. |
| **avg_sentence_length** | Words per sentence (approximate with segment text or full text split). |
| **num_segments** | len(segments). |

(Optional: **words_per_segment_std**, **pause_count_per_segment**, etc., if we want more signals.)

### 4.2 From `browser_rhythm` (in features JSON)

Use as-is (already numeric):

- **speech_rate** (browser-computed)
- **pause_variance**
- **pause_entropy**
- **pitch_variance**
- **energy_variance**
- **voiced_ratio**

### 4.3 Combined feature vector (order must be fixed for model)

Define a single ordered list of feature names and use it both in the **training script** and in **production** (e.g. `run-speech-analysis-background` or `lib/read-vs-speak.ts`). Example:

```
[
  "filler_ratio", "pause_ratio", "segment_duration_variance",
  "speech_rate_wps", "mean_logprob", "mean_compression_ratio",
  "avg_sentence_length", "num_segments",
  "speech_rate", "pause_variance", "pause_entropy",
  "pitch_variance", "energy_variance", "voiced_ratio"
]
```

Missing values (e.g. no browser_rhythm for old jobs): use a sentinel (e.g. 0 or NaN) and handle in model (impute or mask); training data should ideally have both Whisper and browser_rhythm for best results.

### 4.4 Where this runs

- **Training**: Python (or Node) script reads downloaded `features.JSON` files, computes the table above, outputs a **feature matrix** (e.g. CSV or NumPy array) and a **label vector** (see §5).
- **Production**: In `run-speech-analysis-background.ts` we already have (or will have) `whisper_verbose_json` from the job row and optionally `browser_rhythm` from the same job or from the Supabase features object; we compute the same features and pass to the classifier.

---

## 5. Labels for training

We need a binary (or ternary) target: **read** vs **spontaneous** (and optionally **uncertain**).

| Source | How |
|--------|-----|
| **A. In-app feedback** | After submission, ask “Did you read from a script?” or “Rate how natural this was”; store with `job_id` in DB or in Supabase result JSON. Then include this in the result log or a separate table for export. |
| **B. Internal labeling** | Staff listen to audio (or read transcript + features) and tag read/spontaneous; store in a sheet or DB keyed by jobId; join with extracted features when building the training set. |
| **C. Synthetic** | Record known read vs spontaneous samples (e.g. read a paragraph vs answer ad-lib), upload via same pipeline so they get jobIds and land in Supabase; label by construction. |

Until we have enough labels, we can:

- Train a **rule-based** or **threshold** version using heuristics from the plan (e.g. high filler_ratio + high pause_ratio → more spontaneous).
- Use **synthetic + internal** labels to train a small logistic regression or tree model, then add in-app labels as they accumulate and retrain.

---

## 6. Train the classifier

### 6.1 Environment

- **Python** (recommended): `pandas`, `numpy`, `scikit-learn`, and optionally `lightgbm` / `xgboost` for better accuracy once we have enough data.
- **Location**: e.g. `ai_detector/` (existing) or a new `scripts/read_vs_speak/` or `training/read_vs_speak/` so training is separate from the text AI-detector app.

### 6.2 Steps

1. **Load manifest** and features: for each jobId with a label, load `features.JSON`, compute Whisper + browser_rhythm features, build one row.
2. **Handle missing** browser_rhythm or segments: impute (e.g. median) or drop rows for an initial model.
3. **Train**:
   - **Phase 1**: Logistic regression (interpretable, easy to export to JSON coefficients for Node).
   - **Phase 2**: LightGBM or XGBoost (better non-linear boundaries); export to **ONNX** for Node via `onnxruntime-node`.
4. **Validate**: Holdout set; report accuracy / AUC; tune thresholds (e.g. spoken_pct = probability of “spontaneous”).
5. **Export**:
   - **Logistic regression**: JSON with `coefficients`, `intercept`, `feature_names`; in Node, `1 / (1 + Math.exp(-(dot(coefficients, features) + intercept)))`.
   - **Tree model**: ONNX file; load in Node and run `session.run()` with the same feature vector order.

### 6.3 Output

- **Model artifact**: `model/read_vs_speak_coefficients.json` or `model/read_vs_speak.onnx`.
- **Feature names list**: same order as production (see §4.3).
- **Docs**: which features are required; how to impute missing browser_rhythm.

---

## 7. Use in production

- **run-speech-analysis-background.ts** (or shared util `lib/read-vs-speak.ts`):
  - After feedback is built, get `whisper_verbose_json` from the job (and optionally browser_rhythm from job or from Supabase features object if we store it in Neon).
  - Compute the **same** features as in training (same names, same order).
  - Run classifier (coefficients + sigmoid, or ONNX).
  - Set `feedback.delivery = { spoken_pct, mode, confidence, signals }` and write to Neon and Supabase as today.

This replaces the current stub so that `spoken_pct` and `mode` come from the trained model.

---

## 8. Implementation steps (summary)

| Step | Task |
|------|------|
| 1 | **Extract**: Add script (Node or Python) to list Supabase bucket `tutorcat`, download `*.features.JSON` (and optionally `*.JSON`, audio); write manifest or directory layout. |
| 2 | **Feature extraction**: Script that reads each `features.JSON`, computes Whisper-derived + browser_rhythm feature vector; output CSV or matrix + optional labels. |
| 3 | **Labels**: Introduce labeling path (in-app question, internal tagging, or synthetic set); store labels by jobId and join with extracted features. |
| 4 | **Train**: Python pipeline: load features + labels → train logistic regression (then LightGBM/XGBoost) → validate → export coefficients or ONNX + feature names. |
| 5 | **Production**: In background function (or read-vs-speak util), compute same features from job data, load model (JSON or ONNX), set `delivery.spoken_pct` and `delivery.mode`. |
| 6 | **Optional**: Use audio from Supabase + OpenSMILE (or similar) in a second phase for acoustic-only or combined features and retrain. |

---

## 9. Files to add/touch

- **New**: Script(s) to extract from Supabase (e.g. `scripts/export-supabase-speech-data.ts` or `training/read_vs_speak/download_from_supabase.py`).
- **New**: Feature extraction script (e.g. `training/read_vs_speak/features_from_json.py` or shared util used by both training and Node).
- **New**: Training pipeline (e.g. `training/read_vs_speak/train.py`): load features + labels → train → export.
- **New**: Model artifact(s): `model/read_vs_speak_coefficients.json` or `model/read_vs_speak.onnx` (+ feature list).
- **Edit**: `run-speech-analysis-background.ts` (or `lib/read-vs-speak.ts`): compute features, call classifier, set `delivery`.
- **Env**: Scripts need `SUPABASE_URL`, `SUPABASE_SECRET_KEY` for download; training needs no Supabase (runs on exported data).

---

## 10. References

- [Plan: Supabase writer (background call)](plan-supabase-writer-background-call.md) — how result logs and storage layout were defined.
- [Plan: Whisper verbose & read vs speak](plan-whisper-verbose-and-read-vs-speak.md) — Browser rhythm + Whisper features, delivery shape, training with LightGBM/XGBoost and ONNX.
- `functions/speech-job.ts` — uploads audio and `{jobId}.features.JSON` (Whisper + browser_rhythm).
- `functions/run-speech-analysis-background.ts` — uploads `{jobId}.JSON` (result_json, delivery); currently delivery is a stub.
