# Plan: Train and Host a GPT Zero–Like AI Detector (Free / Low-Cost)

## Goal

Train a small, custom AI-detection model (GPT Zero–like) using **free GPU/CPU platforms**, export it, then expose it via a **cheap or free API** so TutorCat can call it instead of (or alongside) the GPT Zero API. This plan covers: dataset → training → export → API → hosting, with a recommended cheap architecture for TutorCat.

---

## 1. Train the Model (Free Options)

Training usually needs more compute than hosting, so we train on **free GPU/CPU notebooks**.

### Good free platforms

| Platform       | Notes                          |
|----------------|---------------------------------|
| **Google Colab** | Free GPU (T4), easy sharing, 12h limit |
| **Kaggle**       | Free GPU (P100), notebooks + datasets  |
| **Hugging Face** | Free Spaces, notebooks, datasets      |

### Typical workflow

```
dataset
   ↓
notebook (Python)
   ↓
train model
   ↓
export model file
```

### Example training code (simplified classifier)

Lightweight option: **TF-IDF + Logistic Regression** (fast to train, small artifact, suitable for serverless or a tiny API).

```python
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import joblib

# Example: replace with real (human_text, ai_text) pairs
texts = ["human text", "ai generated text"]
labels = [0, 1]  # 0 = human, 1 = AI

vectorizer = TfidfVectorizer()
X = vectorizer.fit_transform(texts)

model = LogisticRegression()
model.fit(X, labels)

joblib.dump((vectorizer, model), "detector.pkl")
```

**Output file:** `detector.pkl` (vectorizer + model). For a “GPT Zero–like” improvement, use a larger dataset and optionally a small transformer (see section 7).

---

## 2. Create an API for the Model

A small backend that **loads the model** and **accepts HTTP requests**.

### Framework: FastAPI

```python
from fastapi import FastAPI
import joblib

app = FastAPI()

vectorizer, model = joblib.load("detector.pkl")

@app.post("/predict")
def predict(text: str):
    X = vectorizer.transform([text])
    # If model outputs probability: use model.predict_proba(X)[0][1]
    prediction = model.predict(X)[0]
    proba = model.predict_proba(X)[0][1] if hasattr(model, "predict_proba") else float(prediction)
    return {"ai_probability": proba, "prediction": int(prediction)}
```

This becomes your **ML inference API**. TutorCat will call `POST /predict` with student text and use `ai_probability` (0–1) to derive `risk_score` (0–100) and `flagged`.

---

## 3. Host the Model (Cheap / Free)

### Free or almost free

| Option              | Notes                                  |
|---------------------|----------------------------------------|
| **Hugging Face Spaces** | Free CPU, supports FastAPI, good for ML   |
| **Render**          | Free tier, easy Docker deployment       |
| **Railway**         | Simple deploy, ~$5 free credits        |
| **Fly.io**          | Cheap global hosting, good for APIs    |

### Cost

Roughly **$0–5/month** for a small TF-IDF + LogisticRegression API (low CPU, small memory).

---

## 4. Cheapest Architecture (Recommended)

```
Frontend (Netlify)
        ↓ API request
ML API (Render or Fly.io)
        ↓ loads
Model file (detector.pkl)
```

- **Cost:** $0–5/month.
- Netlify frontend / Netlify Functions send the student text to **your** ML API; the API loads `detector.pkl` and returns `ai_probability`.

---

## 5. If the Model Becomes Larger (Transformers)

For bigger models (e.g. small BERT-style classifiers):

- Use **serverless inference**:
  - **Hugging Face Inference Endpoints**
  - **Replicate**
  - **Modal**
- These charge **per request**, often very cheap.
- No need to run a 24/7 server; scale to zero when idle.

---

## 6. Even Cheaper Trick (Small Models Only)

**Run inference inside a serverless function** instead of a separate API:

- Store **model weights** (e.g. `detector.pkl`) in the function bundle or in cloud storage.
- Run inference in:
  - **Netlify Functions** (Node can call a small Python subprocess or use ONNX/JS runtime if ported)
  - **Cloudflare Workers**
  - **AWS Lambda**

**Constraint:** Only works for **small models** (e.g. &lt;200MB). TF-IDF + LogisticRegression fits; large transformers do not.

---

## 7. TutorCat AI Detector: Recommended Setup

A low-cost architecture that fits the current TutorCat stack:

```
Netlify frontend
        ↓
Netlify function (TutorCat backend)
        ↓ HTTP
Python microservice (Fly.io or Render)
        ↓
ML model (detector.pkl)
```

### Flow

1. Student submits text or speech (transcript) in TutorCat.
2. **Netlify function** (e.g. `ai-feedback.ts` or a dedicated `ai-detect.ts`) receives the text.
3. Function calls **your Python ML API** (e.g. `POST https://your-ml-api.fly.dev/predict` with `text`).
4. Python service loads `detector.pkl`, runs inference, returns `ai_probability`.
5. Netlify function maps `ai_probability` → `risk_score` (0–100), `flagged` (e.g. risk_score ≥ 50), and returns the same `integrity` shape as today.

### Why this is cheap

- **Training:** $0 (Colab/Kaggle/HF).
- **Hosting:** $0–5/month (Fly.io or Render free tier for a small FastAPI + joblib app).
- **No per-request vendor lock-in** like GPT Zero API; you own the model and the endpoint.

### Dataset for “GPT Zero–like” quality

- Collect or use public **human-written** vs **AI-generated** text (e.g. essays, prompts, short answers).
- Balance by domain (academic, casual, ESL) to reduce false positives.
- Optionally use a small **transformer** (e.g. distilled BERT) in Colab/Kaggle, then export to ONNX or use HF Inference Endpoints if the model outgrows a single `detector.pkl`.

---

## 8. Implementation Checklist (TutorCat)

- [ ] **Dataset:** Gather or pick a dataset (human / AI pairs); optionally tag by CEFR or “student-like”.
- [ ] **Notebook:** Train in Colab/Kaggle (TF-IDF + LR or small transformer); export `detector.pkl` (or equivalent).
- [ ] **API:** FastAPI app that loads model, exposes `POST /predict` with `text` → `ai_probability` (and optional `prediction`).
- [ ] **Host:** Deploy API to Fly.io or Render; store `detector.pkl` in the image or mount.
- [ ] **TutorCat integration:** In Netlify function, call your ML API; map response to `integrity.risk_score`, `integrity.flagged`, `integrity.message`; keep existing LLM fallback when API fails.
- [ ] **Env:** e.g. `AI_DETECT_API_URL` and optional `AI_DETECT_API_KEY` if you add auth later.

---

## 9. Summary

| Step       | Tool / place      | Output / cost   |
|-----------|-------------------|------------------|
| Train     | Colab / Kaggle / HF | `detector.pkl`   |
| API       | FastAPI           | `POST /predict`  |
| Host      | Fly.io / Render   | $0–5/month      |
| Call from | Netlify function  | Same `integrity` shape |

For TutorCat, the cheapest path is: **train a small detector (e.g. TF-IDF + LR) in a free notebook → serve it with FastAPI on Fly.io or Render → call it from Netlify functions** and map the result into the existing AI integrity flow.
