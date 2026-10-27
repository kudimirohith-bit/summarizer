"""
verifier.py – Factual verification pipeline for VeriSumm.

Stage 1 (Eq. 1): cosine similarity via sentence-transformers/all-MiniLM-L6-v2
Stage 2: NLI entailment via cross-encoder/nli-deberta-v3-small
Stage 3: Regex rules (numbers, percentages, doses, p-values, years, negations)
Stage 4: Verdict function → SUPPORTED / WEAK / UNSUPPORTED + risk score
Stage 5: Document metrics (Eq. 2 flag rate, trust level)
"""
from __future__ import annotations
import os
import re
import time
import logging
from typing import Optional

import numpy as np
from sentence_transformers import SentenceTransformer, CrossEncoder

from preprocessing import sentence_tokenise
from schemas import EvidenceSentence, SummarySentenceResult, DocMetrics

logger = logging.getLogger(__name__)

MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")

# ── model handles (lazy) ────────────────────────────────────────────────────
_embed_model: Optional[SentenceTransformer] = None
_nli_model: Optional[CrossEncoder] = None

EMBED_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
NLI_MODEL_NAME = "cross-encoder/nli-deberta-v3-small"

EMBED_LOCAL = os.path.join(MODELS_DIR, "sentence-transformers_all-MiniLM-L6-v2")
NLI_LOCAL = os.path.join(MODELS_DIR, "cross-encoder_nli-deberta-v3-small")


def _get_embed() -> SentenceTransformer:
    global _embed_model
    if _embed_model is None:
        if os.path.isdir(EMBED_LOCAL):
            _embed_model = SentenceTransformer(EMBED_LOCAL)
        else:
            _embed_model = SentenceTransformer(EMBED_MODEL_NAME)
        logger.info("Embedding model loaded")
    return _embed_model


def _get_nli() -> CrossEncoder:
    global _nli_model
    if _nli_model is None:
        if os.path.isdir(NLI_LOCAL):
            _nli_model = CrossEncoder(NLI_LOCAL)
        else:
            _nli_model = CrossEncoder(NLI_MODEL_NAME)
        logger.info("NLI model loaded")
    return _nli_model


# ── helpers ─────────────────────────────────────────────────────────────────

_NUM_RE = re.compile(
    r"""
    (?:
        \d+(?:\.\d+)?               # number
        \s*(?:mg|mcg|ug|g|ml|l|    # dose units
              mmol|mol|iu|          
              %|                    # percentages
              (?:p\s*[<=>]\s*\d[\d.e-]+)  # p-values
        )?
    )|
    (?:\d{4})                       # years
    """,
    re.IGNORECASE | re.VERBOSE,
)

_NEG_RE = re.compile(
    r"\b(no|not|without|absence\s+of|lack\s+of|none|never|neither|nor)\b",
    re.IGNORECASE,
)


def _normalise_num(s: str) -> str:
    """Collapse whitespace between number and unit; lowercase."""
    s = re.sub(r"(\d)\s+(mg|mcg|ug|g|ml|l|mmol|mol|iu|%)", r"\1\2", s, flags=re.IGNORECASE)
    return s.lower()


def _extract_numbers(text: str) -> list[str]:
    return _NUM_RE.findall(_normalise_num(text))


def _has_negation(text: str) -> bool:
    return bool(_NEG_RE.search(text))


def _find_offsets(source: str, sent: str) -> tuple[int, int]:
    """Find character offsets of a sentence within source."""
    idx = source.find(sent)
    if idx == -1:
        # Try first 60 chars
        idx = source.find(sent[:60])
    if idx == -1:
        return 0, 0
    return idx, idx + len(sent)


# ── Stage 1: embedding similarity ───────────────────────────────────────────

def _stage1_support(
    summary_sents: list[str],
    source_sents: list[str],
    source_text: str,
    top_k: int = 3,
) -> list[tuple[float, list[EvidenceSentence]]]:
    """
    Returns list of (max_score, top_k_evidence) per summary sentence.
    """
    embed = _get_embed()
    src_embs = embed.encode(source_sents, convert_to_numpy=True, normalize_embeddings=True)
    sum_embs = embed.encode(summary_sents, convert_to_numpy=True, normalize_embeddings=True)

    results = []
    for t_emb in sum_embs:
        scores = (src_embs @ t_emb).tolist()  # cosine since normalised
        scored = sorted(enumerate(scores), key=lambda x: x[1], reverse=True)
        max_score = scored[0][1] if scored else 0.0
        evidence_list = []
        for idx, sc in scored[:top_k]:
            s = source_sents[idx]
            start, end = _find_offsets(source_text, s)
            evidence_list.append(
                EvidenceSentence(sentence=s, score=round(float(sc), 4), start=start, end=end)
            )
        results.append((float(max_score), evidence_list))
    return results


# ── Stage 2: NLI entailment ──────────────────────────────────────────────────

def _stage2_nli(
    summary_sent: str,
    evidence_sents: list[EvidenceSentence],
) -> tuple[float, float]:
    """
    Returns (best_entailment, best_contradiction) across top evidence sentences.
    cross-encoder/nli-deberta-v3-small labels: contradiction, entailment, neutral
    """
    if not evidence_sents:
        return 0.0, 0.0

    nli = _get_nli()
    best_ent = 0.0
    best_con = 0.0
    pairs = [(ev.sentence, summary_sent) for ev in evidence_sents[:3]]
    scores_list = nli.predict(pairs, apply_softmax=True)
    # Label order for deberta-v3-small: contradiction=0, entailment=1, neutral=2
    for scores in scores_list:
        scores = list(scores)
        if len(scores) >= 2:
            contradiction = float(scores[0])
            entailment = float(scores[1])
            if entailment > best_ent:
                best_ent = entailment
            if contradiction > best_con:
                best_con = contradiction
    return best_ent, best_con


# ── Stage 3: Regex rules ─────────────────────────────────────────────────────

def _stage3_rules(
    summary_sent: str,
    source_text: str,
    evidence_sents: list[EvidenceSentence],
) -> list[str]:
    """Return list of rule violation reasons."""
    reasons = []
    norm_src = _normalise_num(source_text)
    norm_sum = _normalise_num(summary_sent)

    # Check numbers/doses/years
    nums_in_summary = set(_extract_numbers(norm_sum))
    nums_in_source = set(_extract_numbers(norm_src))
    for n in nums_in_summary:
        if n and n not in nums_in_source:
            reasons.append(f"number/dose '{n}' not found in source")

    # Negation polarity check
    sum_neg = _has_negation(summary_sent)
    if evidence_sents:
        ev_neg = _has_negation(evidence_sents[0].sentence)
        if sum_neg != ev_neg:
            reasons.append("negation/polarity mismatch with top evidence sentence")

    return reasons


# ── Stage 4: Verdict ─────────────────────────────────────────────────────────

def _verdict(
    sup: float,
    entailment: float,
    contradiction: float,
    rule_reasons: list[str],
    tau: float,
) -> tuple[str, float, list[str]]:
    """
    Returns (verdict, risk_score, reasons).
    UNSUPPORTED: sup < tau OR missing number OR contradiction > 0.5
    WEAK:        sup within 0.1 above tau OR entailment 0.3-0.5
    SUPPORTED:   otherwise
    """
    reasons = list(rule_reasons)
    has_number_miss = any("not found" in r for r in reasons)
    has_negation = any("negation" in r for r in reasons)

    if sup < tau or has_number_miss or contradiction > 0.5:
        verdict = "UNSUPPORTED"
        risk = max(1.0 - sup, contradiction, 0.8 if has_number_miss else 0.0)
        if sup < tau:
            reasons.append(f"support score {sup:.3f} below threshold {tau}")
        if contradiction > 0.5:
            reasons.append(f"contradiction probability {contradiction:.3f} > 0.5")
        risk = min(risk, 1.0)
    elif sup < tau + 0.1 or (0.3 <= entailment <= 0.5):
        verdict = "WEAK"
        risk = 0.5 - (sup - tau) * 2  # scales down as sup rises
        risk = max(0.3, min(0.7, risk))
        reasons.append(f"borderline support score {sup:.3f}")
    else:
        verdict = "SUPPORTED"
        risk = max(0.0, 1.0 - entailment) * 0.3
        risk = min(0.3, risk)

    return verdict, round(risk, 4), reasons


# ── Stage 5: Document metrics ────────────────────────────────────────────────

def _doc_metrics(
    verdicts: list[str],
    seconds_gen: float,
    seconds_ver: float,
    tau: float,
) -> DocMetrics:
    m = len(verdicts)
    num_flagged = sum(1 for v in verdicts if v == "UNSUPPORTED")
    flag_rate = num_flagged / m if m else 0.0
    pct = flag_rate * 100.0
    has_flagged = num_flagged > 0

    if flag_rate == 0.0:
        trust = "High"
    elif flag_rate < 0.3:
        trust = "Medium"
    else:
        trust = "Low"

    return DocMetrics(
        flag_rate=round(flag_rate, 4),
        percent_flagged=round(pct, 2),
        has_flagged=has_flagged,
        trust_level=trust,
        seconds_generation=round(seconds_gen, 3),
        seconds_verification=round(seconds_ver, 3),
        num_sentences=m,
        num_flagged=num_flagged,
    )


# ── Main entry ────────────────────────────────────────────────────────────────

def verify(
    summary_text: str,
    source_text: str,
    tau: float = 0.5,
    seconds_gen: float = 0.0,
) -> tuple[list[SummarySentenceResult], DocMetrics, str]:
    """
    Run full verification pipeline.
    Returns (sentence_results, doc_metrics, verified_summary).
    """
    t0 = time.time()

    source_sents = sentence_tokenise(source_text)
    summary_sents = sentence_tokenise(summary_text)

    if not summary_sents:
        # Nothing to verify
        dm = _doc_metrics([], seconds_gen, 0.0, tau)
        return [], dm, summary_text

    # Stage 1
    stage1 = _stage1_support(summary_sents, source_sents, source_text)

    results: list[SummarySentenceResult] = []
    for i, (sent, (sup, evidence)) in enumerate(zip(summary_sents, stage1)):
        # Stage 2
        ent, con = _stage2_nli(sent, evidence)
        # Stage 3
        rule_reasons = _stage3_rules(sent, source_text, evidence)
        # Stage 4
        verdict, risk, reasons = _verdict(sup, ent, con, rule_reasons, tau)

        results.append(
            SummarySentenceResult(
                text=sent,
                verdict=verdict,
                risk=risk,
                sup=round(float(sup), 4),
                entailment=round(ent, 4),
                contradiction=round(con, 4),
                reasons=reasons,
                evidence=evidence,
            )
        )

    seconds_ver = time.time() - t0
    verdicts = [r.verdict for r in results]
    dm = _doc_metrics(verdicts, seconds_gen, seconds_ver, tau)

    # Verified summary: keep only SUPPORTED+WEAK sentences
    kept = [r.text for r in results if r.verdict != "UNSUPPORTED"]
    if not kept:
        # All flagged: retain original with warning
        verified_summary = summary_text
    else:
        verified_summary = " ".join(kept)

    return results, dm, verified_summary
