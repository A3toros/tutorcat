"""
Reading Detector (read-vs-speak) using frozen Whisper embeddings + logistic head.

This app mirrors the ai_detector folder style, but for audio classification:
  - input: uploaded audio file
  - output: p(speaking), p(reading), and tri-state label
"""

from __future__ import annotations

import json
import math
import subprocess
from pathlib import Path

import gradio as gr
import numpy as np
import torch
from transformers import WhisperFeatureExtractor, WhisperModel


def _sigmoid(x: float) -> float:
    return 1.0 / (1.0 + math.exp(-x))


def _load_model_payload() -> dict:
    candidates = [
        Path(__file__).parent / "model.json",
        Path(__file__).parent.parent / "data" / "models" / "read_vs_speak" / "v2" / "model.json",
    ]
    for p in candidates:
        if p.exists():
            return json.loads(p.read_text(encoding="utf-8"))
    raise FileNotFoundError("Could not find model.json in reading_detector/ or data/models/read_vs_speak/v2/.")


MODEL_PAYLOAD = _load_model_payload()
ENCODER_MODEL = MODEL_PAYLOAD.get("encoder_model", "openai/whisper-small")
SAMPLE_RATE = int(MODEL_PAYLOAD.get("preprocessing", {}).get("sample_rate", 16000))
INPUT_DIM = int(MODEL_PAYLOAD.get("preprocessing", {}).get("input_dim", 768))
SCALER_MEAN = np.array(MODEL_PAYLOAD["preprocessing"]["scaler_mean"], dtype=np.float32)
SCALER_SCALE = np.array(MODEL_PAYLOAD["preprocessing"]["scaler_scale"], dtype=np.float32)
HEAD_COEF = np.array(MODEL_PAYLOAD["head"]["coef"], dtype=np.float32)
HEAD_INTERCEPT = float(MODEL_PAYLOAD["head"]["intercept"])
T_LOW = float(MODEL_PAYLOAD.get("thresholds", {}).get("low", 0.35))
T_HIGH = float(MODEL_PAYLOAD.get("thresholds", {}).get("high", 0.65))

if SCALER_MEAN.shape[0] != INPUT_DIM or SCALER_SCALE.shape[0] != INPUT_DIM or HEAD_COEF.shape[0] != INPUT_DIM:
    raise ValueError("Model dimensions are inconsistent in model.json")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
print(f"Loading encoder: {ENCODER_MODEL} on {DEVICE}")
FEATURE_EXTRACTOR = WhisperFeatureExtractor.from_pretrained(ENCODER_MODEL)
ENCODER = WhisperModel.from_pretrained(ENCODER_MODEL).to(DEVICE).eval()
print("Reading detector ready.")


def decode_audio_ffmpeg(path: str, sample_rate: int = 16000) -> np.ndarray:
    cmd = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        path,
        "-ac",
        "1",
        "-ar",
        str(sample_rate),
        "-f",
        "f32le",
        "-",
    ]
    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg failed: {proc.stderr.decode('utf-8', errors='ignore')}")
    wav = np.frombuffer(proc.stdout, dtype=np.float32)
    if wav.size == 0:
        raise RuntimeError("Decoded audio is empty.")
    return wav


@torch.inference_mode()
def extract_embedding(audio_f32: np.ndarray, sample_rate: int) -> np.ndarray:
    feats = FEATURE_EXTRACTOR(audio_f32, sampling_rate=sample_rate, return_tensors="pt")
    input_features = feats.input_features.to(DEVICE)
    out = ENCODER.encoder(input_features=input_features)
    emb = out.last_hidden_state.mean(dim=1).squeeze(0).cpu().numpy().astype(np.float32)
    return emb


def classify_audio(audio_path: str | None) -> str:
    if not audio_path:
        return "Please upload an audio file."
    try:
        wav = decode_audio_ffmpeg(audio_path, sample_rate=SAMPLE_RATE)
        emb = extract_embedding(wav, sample_rate=SAMPLE_RATE)
        if emb.shape[0] != INPUT_DIM:
            return f"Unexpected embedding size: got {emb.shape[0]}, expected {INPUT_DIM}."

        x = (emb - SCALER_MEAN) / np.where(SCALER_SCALE == 0, 1.0, SCALER_SCALE)
        logit = float(np.dot(HEAD_COEF, x) + HEAD_INTERCEPT)
        p_speaking = _sigmoid(logit)
        p_reading = 1.0 - p_speaking

        if p_speaking >= T_HIGH:
            verdict = "speaking"
            conf = "high confidence"
        elif p_speaking <= T_LOW:
            verdict = "reading"
            conf = "high confidence"
        else:
            verdict = "uncertain"
            conf = "borderline"

        return (
            f"Verdict: {verdict} ({conf})\n"
            f"p(speaking): {p_speaking * 100:.1f}%\n"
            f"p(reading):  {p_reading * 100:.1f}%\n"
            f"thresholds: low={T_LOW:.2f}, high={T_HIGH:.2f}\n"
            f"encoder: {ENCODER_MODEL}"
        )
    except Exception as e:
        return f"Error: {e}"


with gr.Blocks(title="Reading Detector") as demo:
    gr.Markdown("# Reading Detector")
    gr.Markdown("Upload audio to classify **reading vs speaking** with the v2 Whisper-small model.")

    with gr.Row():
        with gr.Column(scale=1):
            audio_input = gr.Audio(type="filepath", label="Audio Input")
            analyse_btn = gr.Button("Analyse", variant="primary")
        with gr.Column(scale=1):
            output = gr.Textbox(label="Result", lines=10)

    analyse_btn.click(fn=classify_audio, inputs=audio_input, outputs=output)

api_demo = gr.Interface(
    fn=classify_audio,
    inputs=gr.Audio(type="filepath", label="Audio Input"),
    outputs=gr.Textbox(label="Result"),
    title="API",
    allow_flagging="never",
)

tabbed = gr.TabbedInterface([demo, api_demo], ["Detector", "API"])

if __name__ == "__main__":
    tabbed.launch()
