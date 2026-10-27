#!/usr/bin/env python3
"""
evaluate.py – Reproduces the paper's evaluation experiment.

Usage:
    python scripts/evaluate.py [--n 50] [--models MODEL1,MODEL2]

Loads first --n documents from ccdv/pubmed-summarization test split.
Runs each model (without and with verification at tau=0.5).
Computes ROUGE-1/ROUGE-L, BERTScore F1, flag rates, and timing.
Tau sweep: 0.4, 0.5, 0.6.
Writes results/results.json and results/results.csv.
"""
from __future__ import annotations
import argparse
import json
import os
import sys
import time
import csv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(SCRIPT_DIR)
MODEL_SERVICE_DIR = os.path.join(ROOT_DIR, "model-service")
RESULTS_DIR = os.path.join(ROOT_DIR, "results")
sys.path.insert(0, MODEL_SERVICE_DIR)

os.makedirs(RESULTS_DIR, exist_ok=True)

ALL_MODELS = ["lead-3", "distilbart-cnn", "bart-large-cnn", "pegasus-pubmed"]


def load_dataset(n: int):
    from datasets import load_dataset
    print(f"Loading ccdv/pubmed-summarization test split (first {n} docs)...")
    ds = load_dataset("ccdv/pubmed-summarization", split="test", trust_remote_code=True)
    return [(row["article"], row["abstract"]) for row in list(ds)[:n]]


def compute_rouge(predictions: list[str], references: list[str]) -> dict:
    from rouge_score import rouge_scorer
    scorer = rouge_scorer.RougeScorer(["rouge1", "rougeL"], use_stemmer=True)
    r1_list, rl_list = [], []
    for pred, ref in zip(predictions, references):
        sc = scorer.score(ref, pred)
        r1_list.append(sc["rouge1"].fmeasure)
        rl_list.append(sc["rougeL"].fmeasure)
    return {
        "rouge1": round(sum(r1_list) / len(r1_list), 4) if r1_list else 0.0,
        "rougeL": round(sum(rl_list) / len(rl_list), 4) if rl_list else 0.0,
    }


def compute_bertscore(predictions: list[str], references: list[str]) -> float:
    try:
        from bert_score import score as bs_score
        P, R, F1 = bs_score(predictions, references, lang="en", verbose=False)
        return round(float(F1.mean()), 4)
    except Exception as e:
        print(f"  Warning: BERTScore failed ({e}), returning 0.0")
        return 0.0


def run_model(model_key: str, docs: list[tuple[str, str]], tau: float = 0.5):
    """Run model on all docs. Returns dict with metrics."""
    from summarizer import summarise
    from verifier import verify
    from preprocessing import lead_3

    summaries_raw = []
    summaries_verified = []
    flag_rates = []
    has_flagged_list = []
    times_gen = []
    times_ver = []

    total = len(docs)
    for i, (article, abstract) in enumerate(docs):
        print(f"    [{i+1}/{total}] {model_key}...", end="\r")
        try:
            summary, t_gen = summarise(model_key, article)
            results, metrics, verified = verify(summary, article, tau=tau, seconds_gen=t_gen)
            summaries_raw.append(summary)
            summaries_verified.append(verified)
            flag_rates.append(metrics.flag_rate)
            has_flagged_list.append(metrics.has_flagged)
            times_gen.append(metrics.seconds_generation)
            times_ver.append(metrics.seconds_verification)
        except Exception as e:
            print(f"\n  Error on doc {i}: {e}")
            summaries_raw.append("")
            summaries_verified.append("")
            flag_rates.append(0.0)
            has_flagged_list.append(False)
            times_gen.append(0.0)
            times_ver.append(0.0)

    print(f"    {model_key}: done ({total} docs)")
    references = [abs_ for _, abs_ in docs]
    rouge_raw = compute_rouge(summaries_raw, references)
    rouge_ver = compute_rouge(summaries_verified, references)
    bscore_raw = compute_bertscore(summaries_raw, references)
    bscore_ver = compute_bertscore(summaries_verified, references)

    n = len(docs)
    avg_flag_rate = sum(flag_rates) / n
    pct_summaries_flagged = sum(1 for f in has_flagged_list if f) / n * 100
    avg_time = sum(times_gen) / n + sum(times_ver) / n

    return {
        "model": model_key,
        "tau": tau,
        "n_docs": n,
        "without_verification": {
            "rouge1": rouge_raw["rouge1"],
            "rougeL": rouge_raw["rougeL"],
            "bertscore_f1": bscore_raw,
            "avg_sec_per_doc": round(sum(times_gen) / n, 3),
        },
        "with_verification": {
            "rouge1": rouge_ver["rouge1"],
            "rougeL": rouge_ver["rougeL"],
            "bertscore_f1": bscore_ver,
            "flag_rate": round(avg_flag_rate, 4),
            "pct_summaries_flagged": round(pct_summaries_flagged, 2),
            "avg_sec_per_doc": round(avg_time, 3),
        },
    }


def tau_sweep(model_key: str, docs: list[tuple[str, str]]) -> list[dict]:
    """Run model with tau 0.4, 0.5, 0.6."""
    from summarizer import summarise
    from verifier import verify

    rows = []
    # Pre-generate summaries once
    summaries = []
    for article, _ in docs:
        try:
            summary, _ = summarise(model_key, article)
            summaries.append(summary)
        except Exception:
            summaries.append("")

    for tau in [0.4, 0.5, 0.6]:
        flag_rates = []
        has_flagged_list = []
        for article, summary in zip([a for a, _ in docs], summaries):
            if not summary:
                flag_rates.append(0.0)
                has_flagged_list.append(False)
                continue
            try:
                results, metrics, _ = verify(summary, article, tau=tau)
                flag_rates.append(metrics.flag_rate)
                has_flagged_list.append(metrics.has_flagged)
            except Exception:
                flag_rates.append(0.0)
                has_flagged_list.append(False)

        n = len(docs)
        rows.append({
            "model": model_key,
            "tau": tau,
            "flag_rate": round(sum(flag_rates) / n, 4) if n else 0.0,
            "pct_summaries_flagged": round(sum(1 for f in has_flagged_list if f) / n * 100, 2) if n else 0.0,
        })
    return rows


def main() -> None:
    parser = argparse.ArgumentParser(description="VeriSumm evaluation")
    parser.add_argument("--n", type=int, default=50, help="Number of test documents (default: 50)")
    parser.add_argument(
        "--models",
        type=str,
        default=",".join(ALL_MODELS),
        help=f"Comma-separated models (default: {','.join(ALL_MODELS)})",
    )
    args = parser.parse_args()

    models = [m.strip() for m in args.models.split(",") if m.strip()]
    n = args.n

    docs = load_dataset(n)
    print(f"Loaded {len(docs)} documents.\n")

    main_results = []
    tau_results = []

    for model_key in models:
        print(f"\n── {model_key} ──")
        try:
            row = run_model(model_key, docs, tau=0.5)
            main_results.append(row)
        except Exception as e:
            print(f"  FAILED: {e}")
            continue

        # Tau sweep only for the main model (pegasus or first model)
        if model_key == "pegasus-pubmed" or model_key == models[0]:
            print(f"  Running tau sweep for {model_key}...")
            try:
                tau_rows = tau_sweep(model_key, docs)
                tau_results.extend(tau_rows)
            except Exception as e:
                print(f"  Tau sweep failed: {e}")

    output = {
        "meta": {
            "note": "Flag rate is an automatic proxy, not a human-judged hallucination rate. Single run.",
            "n_docs": n,
            "dataset": "ccdv/pubmed-summarization (test split)",
            "tau_default": 0.5,
        },
        "main_results": main_results,
        "tau_sweep": tau_results,
    }

    json_path = os.path.join(RESULTS_DIR, "results.json")
    with open(json_path, "w") as f:
        json.dump(output, f, indent=2)
    print(f"\n✅ Wrote {json_path}")

    # Write CSV
    csv_path = os.path.join(RESULTS_DIR, "results.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow([
            "model", "tau", "n_docs",
            "rouge1_without", "rougeL_without", "bertscore_without", "sec_without",
            "rouge1_with", "rougeL_with", "bertscore_with",
            "flag_rate", "pct_summaries_flagged", "sec_with",
        ])
        for r in main_results:
            writer.writerow([
                r["model"], r["tau"], r["n_docs"],
                r["without_verification"]["rouge1"],
                r["without_verification"]["rougeL"],
                r["without_verification"]["bertscore_f1"],
                r["without_verification"]["avg_sec_per_doc"],
                r["with_verification"]["rouge1"],
                r["with_verification"]["rougeL"],
                r["with_verification"]["bertscore_f1"],
                r["with_verification"]["flag_rate"],
                r["with_verification"]["pct_summaries_flagged"],
                r["with_verification"]["avg_sec_per_doc"],
            ])
    print(f"✅ Wrote {csv_path}")


if __name__ == "__main__":
    main()
