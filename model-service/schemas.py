"""Pydantic schemas for VeriSumm model service."""
from __future__ import annotations
from typing import Optional
from pydantic import BaseModel, Field


class SummarizeRequest(BaseModel):
    text: str = Field(..., min_length=50, max_length=200_000)
    model: str = Field(default="pegasus-pubmed")
    tau: float = Field(default=0.5, ge=0.3, le=0.8)
    long_mode: bool = Field(default=False)


class EvidenceSentence(BaseModel):
    sentence: str
    score: float
    start: int
    end: int


class SummarySentenceResult(BaseModel):
    text: str
    verdict: str  # SUPPORTED | WEAK | UNSUPPORTED
    risk: float
    sup: float
    entailment: float
    contradiction: float
    reasons: list[str]
    evidence: list[EvidenceSentence]


class DocMetrics(BaseModel):
    flag_rate: float
    percent_flagged: float
    has_flagged: bool
    trust_level: str  # High | Medium | Low
    seconds_generation: float
    seconds_verification: float
    num_sentences: int
    num_flagged: int


class SummarizeResponse(BaseModel):
    summary_sentences: list[SummarySentenceResult]
    doc_metrics: DocMetrics
    verified_summary: str
    extractive_summary: str
    model_used: str
    seconds_generation: float
    seconds_verification: float


class ModelInfo(BaseModel):
    key: str
    name: str
    description: str
    loaded: bool


class HealthResponse(BaseModel):
    status: str
    models_loaded: list[str]
    device: str
