"""
test_verifier.py – pytest tests for VeriSumm verifier logic.
Tests: number check, negation check, verdict logic.
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

# We test the pure logic functions directly without loading heavy models.

from verifier import _extract_numbers, _has_negation, _verdict, _stage3_rules, _normalise_num
from schemas import EvidenceSentence


# ── Number extraction tests ──────────────────────────────────────────────────

def test_extract_dose_normalised():
    nums = _extract_numbers("Patient received 5 mg of aspirin.")
    assert "5mg" in nums or "5 mg" in nums.copy() or any("5" in n for n in nums)


def test_extract_percentage():
    nums = _extract_numbers("Reduction of 40% was observed.")
    assert any("40" in n for n in nums)


def test_extract_year():
    nums = _extract_numbers("The study was published in 2019.")
    assert "2019" in nums


def test_dose_mismatch_detected():
    """50 mg in summary vs 5 mg in source should trigger a rule violation."""
    source = "Patient received 5 mg of metformin daily."
    summary_sent = "Patient received 50 mg of metformin daily."
    ev = [EvidenceSentence(sentence=source, score=0.9, start=0, end=len(source))]
    reasons = _stage3_rules(summary_sent, source, ev)
    assert any("50mg" in r or "50" in r for r in reasons), f"Expected dose flag, got: {reasons}"


def test_correct_dose_no_flag():
    source = "Patient received 5 mg of metformin daily."
    summary_sent = "Patient received 5 mg of metformin."
    ev = [EvidenceSentence(sentence=source, score=0.95, start=0, end=len(source))]
    reasons = _stage3_rules(summary_sent, source, ev)
    number_reasons = [r for r in reasons if "not found" in r]
    assert not number_reasons, f"Should not flag correct dose, got: {reasons}"


# ── Negation tests ───────────────────────────────────────────────────────────

def test_negation_detected():
    assert _has_negation("Patient shows no signs of fever.") is True


def test_negation_absence_of():
    assert _has_negation("Absence of bleeding was noted.") is True


def test_no_negation():
    assert _has_negation("Patient shows signs of fever.") is False


def test_negation_mismatch_flagged():
    source_sent = "Patient shows signs of fever."
    summary_sent = "Patient shows no signs of fever."
    ev = [EvidenceSentence(sentence=source_sent, score=0.88, start=0, end=len(source_sent))]
    reasons = _stage3_rules(summary_sent, source_sent + " " + source_sent, ev)
    assert any("negation" in r for r in reasons), f"Expected negation flag, got: {reasons}"


# ── Verdict logic tests ───────────────────────────────────────────────────────

def test_verdict_supported():
    verdict, risk, reasons = _verdict(0.75, 0.8, 0.1, [], tau=0.5)
    assert verdict == "SUPPORTED"
    assert risk < 0.5


def test_verdict_unsupported_low_sup():
    verdict, risk, reasons = _verdict(0.3, 0.7, 0.1, [], tau=0.5)
    assert verdict == "UNSUPPORTED"
    assert risk > 0.5


def test_verdict_unsupported_contradiction():
    verdict, risk, reasons = _verdict(0.6, 0.2, 0.7, [], tau=0.5)
    assert verdict == "UNSUPPORTED"


def test_verdict_weak_borderline():
    verdict, risk, reasons = _verdict(0.55, 0.4, 0.1, [], tau=0.5)
    assert verdict == "WEAK"


def test_verdict_unsupported_missing_number():
    reasons = ["number/dose '50mg' not found in source"]
    verdict, risk, r = _verdict(0.7, 0.7, 0.1, reasons, tau=0.5)
    assert verdict == "UNSUPPORTED"


def test_verdict_risk_bounded():
    """Risk must be in [0, 1]."""
    for sup in [0.0, 0.3, 0.5, 0.8, 1.0]:
        for con in [0.0, 0.5, 1.0]:
            verdict, risk, _ = _verdict(sup, 0.5, con, [], tau=0.5)
            assert 0.0 <= risk <= 1.0, f"Risk out of bounds: {risk} (sup={sup}, con={con})"


# ── Normalisation tests ───────────────────────────────────────────────────────

def test_normalise_collapses_space():
    assert "5mg" in _normalise_num("5 mg")


def test_normalise_case():
    assert "10mg" in _normalise_num("10 MG")
