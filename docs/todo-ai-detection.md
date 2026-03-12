# To-Do: AI Detection via Hugging Face

Checklist for training and hosting a GPT Zero–like detector on **Hugging Face** and wiring it into TutorCat.

**Ref:** `docs/plan-huggingface-ai-detector.md`

---

## Dataset

- [ ] Create or pick a Hugging Face dataset (human vs AI text pairs)
- [ ] Optionally tag by CEFR or “student-like” for better ESL behavior

---

## Train

- [ ] Train in HF Notebooks or Colab (TF-IDF + LogisticRegression or small transformer)
- [ ] Export `detector.pkl` (or push transformer to Model Hub)

---

## Model Hub

- [ ] Upload `detector.pkl` (or weights) to an HF model repo (optional but recommended)

---

## Host on Hugging Face Space

- [ ] Create a Space (Gradio or Docker + FastAPI)
- [ ] Load model from repo or local file; expose `POST /predict` → `ai_probability`
- [ ] Note the Space URL for Netlify

---

## TutorCat integration

- [ ] Add env var `AI_DETECT_API_URL` in Netlify (Space or Inference Endpoint URL)
- [ ] In Netlify function (e.g. `ai-feedback.ts` or `ai-detect.ts`): call HF endpoint with student text
- [ ] Map response `ai_probability` → `integrity.risk_score` (0–100), `integrity.flagged` (e.g. ≥50)
- [ ] Keep existing LLM integrity as fallback when HF call fails

---

## Optional

- [ ] Use Inference Endpoints instead of Space for a larger transformer (same integration)
- [ ] Log detection source (e.g. `integrity.source: 'huggingface' | 'llm_fallback'`) for monitoring
