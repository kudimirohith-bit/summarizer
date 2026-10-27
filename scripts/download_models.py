#!/usr/bin/env python3
"""
download_models.py – One-time download of all VeriSumm models.

Usage:
    python scripts/download_models.py [--models MODEL1,MODEL2]

Downloads to model-service/models/ so the service can run HF_HUB_OFFLINE=1.
"""
from __future__ import annotations
import argparse
import os
import sys

# Ensure model-service is on path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
MODEL_SERVICE_DIR = os.path.join(ROOT_DIR, "model-service")
sys.path.insert(0, MODEL_SERVICE_DIR)

MODELS_DIR = os.path.join(MODEL_SERVICE_DIR, "models")
os.makedirs(MODELS_DIR, exist_ok=True)

HF_MODELS = [
    ("google/pegasus-pubmed", "google_pegasus-pubmed"),
    ("facebook/bart-large-cnn", "facebook_bart-large-cnn"),
    ("sshleifer/distilbart-cnn-12-6", "sshleifer_distilbart-cnn-12-6"),
    ("sentence-transformers/all-MiniLM-L6-v2", "sentence-transformers_all-MiniLM-L6-v2"),
    ("cross-encoder/nli-deberta-v3-small", "cross-encoder_nli-deberta-v3-small"),
]

NLTK_DATASETS = ["punkt", "punkt_tab"]


def download_hf_model(hf_name: str, local_name: str, skip: set[str]) -> None:
    if hf_name in skip:
        print(f"  ⏭  Skipping {hf_name}")
        return
    local_path = os.path.join(MODELS_DIR, local_name)
    if os.path.isdir(local_path) and any(os.scandir(local_path)):
        print(f"  ✓  Already downloaded: {hf_name}")
        return

    print(f"  ↓  Downloading {hf_name} → {local_path}")
    from huggingface_hub import snapshot_download
    snapshot_download(repo_id=hf_name, local_dir=local_path, ignore_patterns=["*.msgpack", "flax_model*", "tf_model*", "rust_model*", "onnx/*"])
    print(f"     Done: {hf_name}")


def download_nltk() -> None:
    import nltk
    for ds in NLTK_DATASETS:
        try:
            nltk.data.find(f"tokenizers/{ds}")
            print(f"  ✓  NLTK '{ds}' already present")
        except LookupError:
            print(f"  ↓  Downloading NLTK '{ds}'")
            nltk.download(ds, quiet=False)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download VeriSumm models")
    parser.add_argument(
        "--models",
        type=str,
        default="",
        help="Comma-separated HF model names to download (default: all)",
    )
    args = parser.parse_args()

    skip: set[str] = set()
    if args.models:
        all_names = {hf for hf, _ in HF_MODELS}
        want = set(args.models.split(","))
        skip = all_names - want

    print("\n=== VeriSumm Model Download ===")
    print(f"Target directory: {MODELS_DIR}\n")

    for hf_name, local_name in HF_MODELS:
        download_hf_model(hf_name, local_name, skip)

    print("\n  ↓  Downloading NLTK tokenizer data...")
    download_nltk()

    print("\n✅ All downloads complete. You can now run the service with HF_HUB_OFFLINE=1.")


if __name__ == "__main__":
    main()
