"""
main.py – FastAPI model service for VeriSumm.
POST /summarize-verify, GET /models, GET /health
Timeout: 300 s enforced by uvicorn worker timeout.
"""
from __future__ import annotations
import logging
import os
import time

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from schemas import (
    SummarizeRequest,
    SummarizeResponse,
    ModelInfo,
    HealthResponse,
    DocMetrics,
)
from summarizer import MODEL_REGISTRY, summarise, loaded_keys, DEVICE
from verifier import verify
from preprocessing import lead_3, sentence_tokenise

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("verisumm.service")

app = FastAPI(
    title="VeriSumm Model Service",
    description="Safety-first clinical and biomedical text summarisation with factual verification.",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(
        status="ok",
        models_loaded=loaded_keys(),
        device=DEVICE,
    )


@app.get("/models", response_model=list[ModelInfo])
def list_models() -> list[ModelInfo]:
    return [
        ModelInfo(
            key=k,
            name=v["hf_name"] or k,
            description=v["description"],
            loaded=k in loaded_keys(),
        )
        for k, v in MODEL_REGISTRY.items()
    ]


@app.post("/summarize-verify", response_model=SummarizeResponse)
async def summarize_verify(req: SummarizeRequest) -> SummarizeResponse:
    if req.model not in MODEL_REGISTRY:
        raise HTTPException(status_code=400, detail=f"Unknown model '{req.model}'. Available: {list(MODEL_REGISTRY.keys())}")

    if len(req.text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Input text too short (min 50 chars).")

    logger.info("Request model=%s tau=%.2f long_mode=%s text_len=%d",
                req.model, req.tau, req.long_mode, len(req.text))

    # ── Stage 1: Generate summary ────────────────────────────────────────────
    try:
        summary_text, secs_gen = summarise(req.model, req.text, long_mode=req.long_mode)
    except Exception as exc:
        logger.exception("Summarisation failed")
        raise HTTPException(status_code=500, detail=f"Summarisation error: {exc}")

    # ── Stage 2+: Verify against FULL source ────────────────────────────────
    try:
        sentence_results, doc_metrics, verified_summary = verify(
            summary_text, req.text, tau=req.tau, seconds_gen=secs_gen
        )
    except Exception as exc:
        logger.exception("Verification failed")
        raise HTTPException(status_code=500, detail=f"Verification error: {exc}")

    # ── Hallucination minimisation: regenerate if >30% UNSUPPORTED ──────────
    num_unsupported = sum(1 for r in sentence_results if r.verdict == "UNSUPPORTED")
    num_total = len(sentence_results) or 1
    if req.model != "lead-3" and num_unsupported / num_total > 0.30:
        logger.info("Flag rate %.1f%% > 30%%; regenerating with strict settings", num_unsupported / num_total * 100)
        try:
            strict_summary, strict_gen = summarise(req.model, req.text, long_mode=req.long_mode, strict=True)
            strict_results, strict_metrics, strict_verified = verify(
                strict_summary, req.text, tau=req.tau, seconds_gen=strict_gen
            )
            # Keep the candidate with the lower flag rate
            if strict_metrics.flag_rate < doc_metrics.flag_rate:
                logger.info("Using strict regeneration (lower flag rate)")
                summary_text = strict_summary
                sentence_results = strict_results
                doc_metrics = strict_metrics
                verified_summary = strict_verified
                secs_gen = strict_gen
        except Exception:
            logger.warning("Strict regeneration failed; keeping original")

    # ── Extractive summary (lead-3) ──────────────────────────────────────────
    extractive = lead_3(req.text)

    return SummarizeResponse(
        summary_sentences=sentence_results,
        doc_metrics=doc_metrics,
        verified_summary=verified_summary,
        extractive_summary=extractive,
        model_used=req.model,
        seconds_generation=doc_metrics.seconds_generation,
        seconds_verification=doc_metrics.seconds_verification,
    )
