# Plan: Hugging Face for AI Detector (Train + Host)

## Goal

Use **Hugging Face** end-to-end to train a GPT Zero–like AI detector and host it for TutorCat: datasets, notebooks, model repo, **Spaces** (free API), and optional **Inference Endpoints** for larger models.

---

## 1. Hugging Face Overview

| Resource | Use |
|----------|-----|
| **Datasets** | Public human vs AI text datasets; upload your own |
| **Notebooks** | Free GPU/CPU (in-browser or linked Colab); train and export model |
| **Model Hub** | Store `detector.pkl` or transformer weights; version and share |
| **Spaces** | Free CPU (or paid GPU) app hosting — Gradio or FastAPI; public API |
| **Inference Endpoints** | Managed serverless inference; pay per request for larger models |

---

## 2. Dataset on Hugging Face

- **Browse:** [huggingface.co/datasets](https://huggingface.co/datasets) — search “AI generated text”, “human vs GPT”, “essay detection”.
- **Example datasets:** e.g. `Hello-SimpleAI/HC3`, or similar human/question + AI answer pairs; adapt for binary classification (human=0, AI=1).
- **Upload your own:** Create a dataset repo, push CSV/JSON/Parquet with columns like `text`, `label` (0/1). Use in notebooks via `datasets.load_dataset("your-org/your-dataset")`.

---

## 3. Train in a Notebook (Hugging Face or Colab)

- **Option A — HF Notebooks:** [huggingface.co/notebooks](https://huggingface.co/notebooks) — free CPU; link to a GPU-backed Colab if needed.
- **Option B — Colab:** Train there, then upload the model to the Hub.

**Workflow:**

```
HF Dataset (or your CSV)
   ↓
Notebook: load data → vectorize (TF-IDF or tokenizer) → train (sklearn or Trainer)
   ↓
Export: detector.pkl OR push transformer to Model Hub
```

**Simple sklearn (same as in main plan):**

```python
from datasets import load_dataset
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
import joblib

# ds = load_dataset("your-org/ai-detection-dataset")
texts = ["human text", "ai text"]  # replace with dataset
labels = [0, 1]

vectorizer = TfidfVectorizer()
X = vectorizer.fit_transform(texts)
model = LogisticRegression()
model.fit(X, labels)
joblib.dump((vectorizer, model), "detector.pkl")
```

Then either **upload `detector.pkl` to a Space** (see below) or **push a transformer** to the Model Hub and use Inference Endpoints.

---

## 4. Host on Hugging Face Spaces (Free API)

Spaces can run **Gradio** or **Docker** (custom FastAPI). Free CPU tier is enough for a small sklearn model.

### 4.1 Create a Space

- [huggingface.co/spaces](https://huggingface.co/spaces) → **Create new Space**.
- Pick **SDK**: **Gradio** (quick UI + API) or **Docker** (full control, FastAPI).

### 4.2 Option A — Gradio (simplest)

- Gradio automatically gives you a **POST API** for your prediction function.
- Add a `requirements.txt` (e.g. `scikit-learn`, `joblib`) and upload `detector.pkl` to the Space repo.

**Example `app.py`:**

```python
import joblib
import gradio as gr

vectorizer, model = joblib.load("detector.pkl")

def predict(text):
    if not text or not text.strip():
        return {"ai_probability": 0.0}
    X = vectorizer.transform([text])
    proba = model.predict_proba(X)[0][1]
    return {"ai_probability": float(proba)}

demo = gr.Interface(
    fn=predict,
    inputs="text",
    outputs="json",
    title="AI Detector",
)
demo.launch()
```

- **Space URL:** `https://huggingface.co/spaces/your-org/ai-detector`
- **API:** Gradio exposes an API; see [Gradio Client / API docs](https://www.gradiodocs.com/) for the exact request format. Alternatively use **Docker** and FastAPI for a clean `POST /predict`.

### 4.3 Option B — Docker + FastAPI (clean REST)

- Create a Space with **Docker**.
- In the Space repo, add `Dockerfile` and your app.

**Dockerfile (minimal):**

```dockerfile
FROM python:3.11-slim
RUN pip install fastapi uvicorn scikit-learn joblib
COPY . /app
WORKDIR /app
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "7860"]
```

**main.py:**

```python
from fastapi import FastAPI
import joblib

app = FastAPI()
vectorizer, model = joblib.load("detector.pkl")

@app.post("/predict")
def predict(text: str):
    X = vectorizer.transform([text])
    proba = model.predict_proba(X)[0][1]
    return {"ai_probability": float(proba)}
```

- Put `detector.pkl` in the repo (or download from HF Model Hub in Dockerfile).
- Space URL: `https://your-org-ai-detector.hf.space` (or similar). HF Spaces on Docker often expose port **7860** and a **public URL**; check the Space settings for the exact endpoint.

### 4.4 Calling the Space from TutorCat (Netlify function)

- Your Space is a public HTTPS endpoint. From a Netlify function, `fetch(SPACE_URL + "/predict", { method: "POST", body: JSON.stringify({ text }) })` (or the payload format your Space expects).
- Map `ai_probability` → `risk_score = Math.round(ai_probability * 100)`, `flagged = risk_score >= 50`.

---

## 5. Model on the Model Hub (optional)

- Create a **model repo** on [huggingface.co/models](https://huggingface.co/models).
- Upload `detector.pkl` (or full transformer weights).
- Spaces (or any host) can **download the model at build/runtime** via `huggingface_hub`:

```python
from huggingface_hub import hf_hub_download
path = hf_hub_download(repo_id="your-org/ai-detector-model", filename="detector.pkl")
vectorizer, model = joblib.load(path)
```

This keeps the Space repo light and versioning in one place.

---

## 6. Larger Models: Inference Endpoints

- If you train a **transformer** (e.g. distilled BERT for classification), it may be too heavy for a free Space CPU.
- Use **Hugging Face Inference Endpoints**: [huggingface.co/inference-endpoints](https://huggingface.co/inference-endpoints).
- Deploy your model from the Hub; you get a **dedicated URL** and **per-request pricing**; scale to zero when idle.
- TutorCat Netlify function calls that URL with the same pattern: send text, get `ai_probability` or logits, map to `risk_score` and `flagged`.

---

## 7. TutorCat Architecture (Hugging Face–only)

```
Netlify frontend
       ↓
Netlify function (ai-feedback / ai-detect)
       ↓ HTTP POST
Hugging Face Space (or Inference Endpoint)
       ↓
Model (detector.pkl or transformer from Hub)
```

- **Cost:** $0 with free Space CPU; or pay-per-use with Inference Endpoints.
- **Env:** `AI_DETECT_API_URL` = your Space or Endpoint URL; optional `HF_TOKEN` if the Space is private.

---

## 8. Implementation Checklist (Hugging Face path)

- [ ] **Dataset:** Create or pick an HF dataset (human/AI text); optionally private repo.
- [ ] **Notebook:** Train on HF Notebooks or Colab; export `detector.pkl` (or push transformer to Hub).
- [ ] **Model Hub:** Upload `detector.pkl` (or weights) to an HF model repo.
- [ ] **Space:** Create Space (Gradio or Docker + FastAPI); load model from repo or local file; expose `POST /predict` → `ai_probability`.
- [ ] **TutorCat:** In Netlify function, set `AI_DETECT_API_URL` to Space/Endpoint URL; call it; map response to `integrity.risk_score`, `integrity.flagged`; keep LLM fallback on failure.
- [ ] **Optional:** Use Inference Endpoints for a larger model; same integration from Netlify.

---

## 9. Summary

| Step   | Where (Hugging Face)     | Output / cost   |
|--------|--------------------------|------------------|
| Data   | HF Datasets              | Dataset repo     |
| Train  | HF Notebooks or Colab   | `detector.pkl` or model |
| Store  | HF Model Hub             | Model repo       |
| Host   | HF Space (Gradio/Docker) | Free public API  |
| Scale  | HF Inference Endpoints   | Pay per request  |
| Call   | Netlify function         | Same `integrity` shape |

Using **Hugging Face only**: dataset → train in notebook → push model to Hub → run inference on a **Space** (free) or **Inference Endpoint** (for big models), and call that from TutorCat.
