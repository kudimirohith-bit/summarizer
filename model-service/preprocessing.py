"""
preprocessing.py – NLTK-based sentence tokenisation for VeriSumm.
Per the paper: discard fragments of ≤ 2 words.
"""
from __future__ import annotations
import re
import nltk

# Download punkt silently once
try:
    nltk.data.find("tokenizers/punkt_tab")
except LookupError:
    nltk.download("punkt_tab", quiet=True)

try:
    nltk.data.find("tokenizers/punkt")
except LookupError:
    nltk.download("punkt", quiet=True)


def _clean(text: str) -> str:
    """Normalise whitespace and remove Pegasus <n> tokens."""
    text = text.replace("<n>", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def sentence_tokenise(text: str) -> list[str]:
    """Return sentences with ≥ 3 words (paper requirement)."""
    text = _clean(text)
    try:
        sents = nltk.sent_tokenize(text)
    except Exception:
        # Fallback: split on period+space
        sents = re.split(r"(?<=[.!?])\s+", text)
    return [s.strip() for s in sents if len(s.split()) > 2]


def lead_3(text: str) -> str:
    """Extractive baseline – first three valid sentences."""
    sents = sentence_tokenise(text)
    return " ".join(sents[:3])


def chunk_by_sentences(text: str, max_tokens: int = 900) -> list[str]:
    """
    Split long text into chunks where each chunk has at most ~max_tokens
    tokens (approximated as whitespace-split words * 1.3).
    """
    sents = sentence_tokenise(text)
    chunks: list[str] = []
    current_chunk: list[str] = []
    current_len = 0

    for s in sents:
        # Rough token estimate
        tok_est = int(len(s.split()) * 1.3)
        if current_len + tok_est > max_tokens and current_chunk:
            chunks.append(" ".join(current_chunk))
            current_chunk = [s]
            current_len = tok_est
        else:
            current_chunk.append(s)
            current_len += tok_est

    if current_chunk:
        chunks.append(" ".join(current_chunk))
    return chunks
