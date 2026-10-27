"""
summarizer.py – lazy-loading model registry for VeriSumm.
Models: pegasus-pubmed, bart-large-cnn, distilbart-cnn, lead-3.
Decoding: beam search, num_beams=4, no_repeat_ngram_size=3,
          repetition_penalty=1.2, min_length=50, max_length=200.
Long-document mode: chunk → summarise chunks → summarise joined.
"""
from __future__ import annotations
import os
import time
import logging
from typing import Optional

import torch
from transformers import AutoTokenizer, AutoModelForSeq2SeqLM, pipeline

from preprocessing import sentence_tokenise, lead_3, chunk_by_sentences

logger = logging.getLogger(__name__)

# ─── registry ──────────────────────────────────────────────────────────────
MODEL_REGISTRY: dict[str, dict] = {
    "pegasus-pubmed": {
        "hf_name": "google/pegasus-pubmed",
        "description": "PEGASUS fine-tuned on PubMed – default for scientific articles",
        "max_input_tokens": 1024,
    },
    "bart-large-cnn": {
        "hf_name": "facebook/bart-large-cnn",
        "description": "BART-large fine-tuned on CNN/DM – short clinical notes, general text",
        "max_input_tokens": 1024,
    },
    "distilbart-cnn": {
        "hf_name": "sshleifer/distilbart-cnn-12-6",
        "description": "DistilBART – lightweight option for slow machines",
        "max_input_tokens": 1024,
    },
    "lead-3": {
        "hf_name": None,
        "description": "Lead-3 extractive baseline – no model required",
        "max_input_tokens": None,
    },
}

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# Cache of loaded (tokenizer, model) pairs
_cache: dict[str, tuple] = {}

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

# ─── Decoding defaults ──────────────────────────────────────────────────────
DECODE_KWARGS_NORMAL = dict(
    num_beams=4,
    no_repeat_ngram_size=3,
    repetition_penalty=1.2,
    min_length=50,
    max_new_tokens=200,
    early_stopping=True,
)

DECODE_KWARGS_STRICT = dict(
    num_beams=6,
    no_repeat_ngram_size=3,
    repetition_penalty=1.5,
    min_length=50,
    max_new_tokens=200,
    early_stopping=True,
)


def _get_model_path(key: str) -> str:
    cfg = MODEL_REGISTRY[key]
    hf_name = cfg["hf_name"]
    # Convert slashes to underscores for local path
    local_name = hf_name.replace("/", "_")
    return os.path.join(MODELS_DIR, local_name)


def _load(key: str) -> tuple:
    """Load tokenizer + model from local cache or HF hub."""
    if key in _cache:
        return _cache[key]

    cfg = MODEL_REGISTRY[key]
    if cfg["hf_name"] is None:
        _cache[key] = (None, None)
        return (None, None)

    local_path = _get_model_path(key)
    if os.path.isdir(local_path):
        logger.info("Loading %s from local path %s", key, local_path)
        tok = AutoTokenizer.from_pretrained(local_path, local_files_only=True)
        model = AutoModelForSeq2SeqLM.from_pretrained(local_path, local_files_only=True)
    else:
        logger.info("Local model not found for %s – downloading from HF hub", key)
        hf_name = cfg["hf_name"]
        tok = AutoTokenizer.from_pretrained(hf_name)
        model = AutoModelForSeq2SeqLM.from_pretrained(hf_name)

    model = model.to(DEVICE)
    model.eval()
    _cache[key] = (tok, model)
    logger.info("Model %s ready on %s", key, DEVICE)
    return (tok, model)


def loaded_keys() -> list[str]:
    return list(_cache.keys())


def _generate_once(key: str, text: str, strict: bool = False) -> str:
    """Run one summarisation pass. Truncates to 1024 tokens."""
    cfg = MODEL_REGISTRY[key]
    max_in = cfg["max_input_tokens"] or 1024
    tok, model = _load(key)

    decode_kwargs = DECODE_KWARGS_STRICT if strict else DECODE_KWARGS_NORMAL

    inputs = tok(
        text,
        return_tensors="pt",
        max_length=max_in,
        truncation=True,
    ).to(DEVICE)

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            **decode_kwargs,
        )
    summary = tok.decode(output_ids[0], skip_special_tokens=True)
    # Replace Pegasus <n> newline token
    summary = summary.replace("<n>", " ").strip()
    return summary


def summarise(
    key: str,
    text: str,
    long_mode: bool = False,
    strict: bool = False,
) -> tuple[str, float]:
    """
    Returns (summary_text, elapsed_seconds).
    Long-doc mode: chunk → summarise each → summarise joined.
    """
    t0 = time.time()

    if key == "lead-3":
        return lead_3(text), time.time() - t0

    _load(key)  # warm up

    if not long_mode:
        summary = _generate_once(key, text, strict=strict)
    else:
        # Split into ~900-token chunks
        chunks = chunk_by_sentences(text, max_tokens=900)
        if len(chunks) == 1:
            summary = _generate_once(key, chunks[0], strict=strict)
        else:
            chunk_summaries = [_generate_once(key, c, strict=strict) for c in chunks]
            joined = " ".join(chunk_summaries)
            summary = _generate_once(key, joined, strict=strict)

    elapsed = time.time() - t0
    return summary, elapsed
