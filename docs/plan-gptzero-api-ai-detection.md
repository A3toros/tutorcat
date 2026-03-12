# Plan: Use GPT Zero API for AI Detection

## Goal

Integrate **GPT Zero’s AI detection API** as the primary (or optional) source for “AI integrity” scoring in TutorCat, while keeping the existing LLM-based heuristics as a fallback. This gives classroom deployments a dedicated, high-accuracy detector (e.g. 96.5% accuracy, &lt;1% false positive, ESL-debiased) alongside our current level/vocab/robotic-cues logic.

---

## Current State

- **AI integrity** is implemented in:
  - `functions/ai-feedback.ts` (writing / text analysis)
  - `functions/ai-speech-to-text.ts` (speaking: transcript → feedback + integrity)
  - `functions/run-speech-analysis-background.ts` (per-prompt background analysis)
- We expose **`integrity.risk_score`** (0–100), **`integrity.flagged`** (true if risk_score ≥ 50), **`integrity.message`**, and **`integrity.signals`** (level_mismatch, off_syllabus_vocab, robotic_cues).
- All of this is currently **LLM-judge based** (prompts that ask the model to score AI likelihood). No third-party detection API is used yet.

---

## GPT Zero API Overview

- **Docs**: [GPT Zero Developers](https://gptzero.me/developers), [API docs](https://gptzero.stoplight.io/)
- **Auth**: API key from [app.gptzero.me/api](https://app.gptzero.me/api), sent as **`x-api-key`** header.
- **Endpoint (single text)**:
  - `POST https://api.gptzero.me/v2/predict/text`
  - Headers: `Accept: application/json`, `Content-Type: application/json`, `x-api-key: <key>`
  - Body: `{ "document": "string", "version": "string" }` (version optional).
- **Response (conceptual)**:
  - **document_classification**: `HUMAN_ONLY` | `MIXED` | `AI_ONLY`
  - **class_probabilities**: probabilities per class
  - **confidence_category**: `high` | `medium` | `low` (high ≈ &lt;1% error rate)
  - **highlight_sentence_for_ai**: sentence-level AI highlights (optional)
- **Characteristics**:
  - 96.5% accuracy on mixed documents, &lt;1% false positive; ESL-debiased (e.g. TOEFL false positive ~1.1%).
  - Detects latest models (GPT-5, Claude, Gemini, LLaMA, etc.).
  - Sub-150ms latency (global edge).
  - SOC 2 compliant; no document storage on their side for API calls.

---

## Integration Strategy

### Option A — Replace LLM integrity with GPT Zero (recommended for “single source of truth”)

- In `ai-feedback.ts` and `ai-speech-to-text.ts` (and optionally `run-speech-analysis-background.ts`):
  - When integrity is needed, **first** call GPT Zero API with the **transcript or text**.
  - Map GPT Zero’s result to our shape:
    - `document_classification === 'AI_ONLY'` → high `risk_score` (e.g. 80–100), `flagged: true`.
    - `document_classification === 'MIXED'` → medium `risk_score` (e.g. 50–80), `flagged` if above threshold.
    - `document_classification === 'HUMAN_ONLY'` → low `risk_score` (e.g. 0–30), `flagged: false`.
  - Use **class_probabilities** (e.g. AI probability) to derive a 0–100 `risk_score` so existing UI (e.g. threshold 50) still works.
  - If GPT Zero API fails (network, 4xx/5xx, missing key), **fallback** to current LLM-based integrity so the product still works.

### Option B — Hybrid: GPT Zero + LLM signals

- Call GPT Zero for a **document-level score**.
- Keep LLM signals (level_mismatch, off_syllabus_vocab, robotic_cues) for **context** (e.g. CEFR level, target vocab) and combine:
  - e.g. `risk_score = 0.6 * gptZeroScore + 0.4 * llmSignalsScore`, or use GPT Zero as primary and LLM as tie-breaker when confidence is low.

### Option C — GPT Zero only where text is long enough

- GPT Zero works best on longer texts. For very short answers (e.g. &lt;30 words), keep LLM-only or skip flagging; for longer text (e.g. speaking transcript, essay), call GPT Zero.

**Recommendation**: Start with **Option A** (GPT Zero primary, LLM fallback), and add a feature flag or env so we can disable GPT Zero and use only LLM if needed (e.g. no API key, cost).

---

## Mapping GPT Zero → Our Integrity Shape

- **risk_score (0–100)**  
  - From **class_probabilities**: e.g. `ai_probability = class_probabilities.ai` (or equivalent from response).  
  - Set `risk_score = Math.round(ai_probability * 100)`.  
  - If only labels are given, use: `AI_ONLY` → 90, `MIXED` → 60, `HUMAN_ONLY` → 15 (then tune).

- **flagged**  
  - `flagged = risk_score >= 50` (keep current product threshold).

- **message**  
  - If `flagged`: `"Your answer was flagged for using AI. Please try again using your own words."` (unchanged).

- **signals** (optional)  
  - Add e.g. `signals.gptzero = { classification, confidence_category, ai_probability }` for debugging/admin, and keep existing signals from LLM fallback when used.

---

## Environment and Configuration

- **Env var**: e.g. `GPTZERO_API_KEY` (or `GPT_ZERO_API_KEY`). If unset, skip GPT Zero and use LLM-only path.
- **Netlify**: Add `GPTZERO_API_KEY` in Netlify dashboard (Environment variables) for production; do not commit the key.
- **Optional**: `GPTZERO_AI_DETECTION_ENABLED=true|false` to turn integration on/off without removing the key.

---

## Where to Call GPT Zero

| Location | Content to send | When |
|----------|------------------|------|
| `functions/ai-feedback.ts` | `content` (student writing) | On `type: "text_analysis"` (and any path that returns integrity). |
| `functions/ai-speech-to-text.ts` | Final transcript (or concatenated per-prompt transcripts) | After transcription, before or in parallel with existing feedback/integrity. |
| `functions/run-speech-analysis-background.ts` | Per-prompt transcript | Optional: each segment, or only when merging to a single “document” for the lesson. |

Implementation order: **ai-feedback.ts** first (writing), then **ai-speech-to-text.ts** (speaking), then background if desired.

---

## Implementation Steps

1. **Create a shared GPT Zero client (e.g. `functions/lib/gptzero.ts` or `utils/gptzero.ts`)**  
   - `detectAI(text: string): Promise<{ risk_score: number, classification, confidence_category?, raw? }>`.  
   - POST to `https://api.gptzero.me/v2/predict/text` with `document: text`.  
   - Parse response, map to `risk_score` 0–100, return.  
   - On failure (network, non-2xx), throw or return a result that triggers fallback.

2. **Add env check**  
   - If `GPTZERO_API_KEY` is missing or `GPTZERO_AI_DETECTION_ENABLED` is false, skip calling GPT Zero and use existing LLM integrity only.

3. **Integrate in `ai-feedback.ts`**  
   - For requests that need integrity (e.g. text_analysis):  
     - Call `detectAI(context.content)`.  
     - Set `feedback.integrity.risk_score`, `flagged`, `message` from GPT Zero result.  
   - On GPT Zero failure, call existing LLM integrity logic and use its result (fallback).

4. **Integrate in `ai-speech-to-text.ts`**  
   - After you have the transcript used for feedback:  
     - Call `detectAI(transcript)`.  
     - Set `feedbackResult.integrity` from GPT Zero; on failure, keep current LLM-based integrity.

5. **Optional: `run-speech-analysis-background.ts`**  
   - If we want background jobs to use GPT Zero, call it per transcript or on a merged transcript and store the result in the same integrity shape (e.g. in `speech_jobs` or lesson_activity_results).

6. **Admin / logging**  
   - Log whether GPT Zero or fallback was used (e.g. `integrity.source: 'gptzero' | 'llm_fallback'`) so we can monitor adoption and errors.

7. **Docs and config**  
   - Document `GPTZERO_API_KEY` and optional `GPTZERO_AI_DETECTION_ENABLED` in README or internal runbook.  
   - Ensure API key is only in env, never in repo.

---

## Cost and Limits

- GPT Zero is a paid API (subscription at [app.gptzero.me/app/api-subscription](https://app.gptzero.me/app/api-subscription)). Pricing and rate limits are per their plan.
- We should add **rate limiting or caching** if we call it on every submission (e.g. per user/minute) to avoid unexpected cost.
- Short-text caveat: their FAQ says they perform best on longer texts; for very short answers we may keep LLM-only or a higher threshold.

---

## Summary

- Use **GPT Zero API** as the primary AI detector for student text and transcripts.
- Map **document_classification** / **class_probabilities** to our existing **risk_score** and **flagged** so the UI and admin flows stay unchanged.
- **Fallback** to current LLM-based integrity when the API key is missing or the request fails.
- Add **env vars** (`GPTZERO_API_KEY`, optional `GPTZERO_AI_DETECTION_ENABLED`) and a small **shared client**; integrate first in **ai-feedback**, then **ai-speech-to-text**, then optionally in background analysis.
