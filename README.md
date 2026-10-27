# VeriSumm: A Safety-First Clinical & Biomedical Text Summarization Platform with Automated Factual Verification

> **Clinical Safety Notice**: AI-assisted summaries require licensed clinician review prior to any clinical or medical use. Factual verification checks measure semantic support and entailment with respect to the provided source text, not external clinical ground truth.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-yellow.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.111-green.svg)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-18-cyan.svg)](https://react.dev/)
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8.svg)](https://tailwindcss.com/)

---

## 1. Overview & Research Architecture

**VeriSumm** is a full-stack, local-first clinical NLP platform that pairs state-of-the-art pretrained transformer summarization models with a multi-signal factual verification pipeline. Designed strictly around safety-first biomedical NLP principles, VeriSumm audits every generated sentence before presenting it to clinicians, flags potential hallucinations, highlights source evidence, and supports one-click extractive fallback repair.

The platform faithfully implements the four-stage clinical summarization architecture:

```
┌─────────────────┐     ┌──────────────────────┐     ┌───────────────────────┐     ┌───────────────────────┐
│  1. Ingestion   │ ──> │    2. Generation     │ ──> │    3. Verification    │ ──> │   4. Review & Audit   │
│                 │     │                      │     │                       │     │                       │
│ • NLTK Sentence │     │ • PEGASUS-PubMed     │     │ • Cosine Sup (Eq. 1)  │     │ • Clinician Dual-Pane │
│   Tokenizer     │     │ • BART-Large-CNN     │     │ • NLI DeBERTa (Ent/   │     │ • Accept / Reject /   │
│ • Fragment Prune│     │ • DistilBART-CNN     │     │   Contradiction)      │     │   Edit per Sentence   │
│   (≤ 2 words)   │     │ • Lead-3 Baseline    │     │ • Regex Numeric Check │     │ • One-click Extractive│
│ • Chunk Manager │     │ • Beam=4, Rep=1.2    │     │ • Negation Mismatch   │     │   Fallback Repair     │
│   (Long Docs)   │     │ • Gen-Verify-Repair  │     │ • Verdicts & Risk     │     │ • Immutable Audit Log │
└─────────────────┘     └──────────────────────┘     └───────────────────────┘     └───────────────────────┘
```

---

## 2. Prerequisites

- **Node.js**: `v18.0.0` or newer (Tested on Node `v20.20.2`)
- **Python**: `3.10+` (Tested on Python `3.10.12`)
- **Operating System**: Linux / macOS / Windows WSL2
- **Memory**: 8 GB RAM minimum (16 GB recommended for PEGASUS/BART in CPU mode)
- **Database**: Local MongoDB is optional. If MongoDB (`mongodb://localhost:27017/verisumm`) is not installed or unreachable, the system automatically falls back to an embedded in-memory database (`mongodb-memory-server`).

---

## 3. One-Time Setup

### Step 1: Install Node Dependencies
From the repository root:
```bash
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

### Step 2: Install Python Model Service Dependencies
Create and activate a virtual environment using `uv` (recommended) or standard `venv`:

```bash
# Using uv (fastest):
uv venv .venv --python python3.10
uv pip install --python .venv -r model-service/requirements.txt

# Or using standard venv + pip:
python3 -m venv .venv
source .venv/bin/activate
pip install -r model-service/requirements.txt
```

### Step 3: Download Pretrained Model Weights (Offline Execution)
VeriSumm operates completely offline (`HF_HUB_OFFLINE=1`). Pretrained weights are downloaded once into `model-service/models/`:

```bash
.venv/bin/python scripts/download_models.py
```
This fetches:
- `google/pegasus-pubmed`
- `facebook/bart-large-cnn`
- `sshleifer/distilbart-cnn-12-6`
- `sentence-transformers/all-MiniLM-L6-v2`
- `cross-encoder/nli-deberta-v3-small`
- NLTK `punkt` & `punkt_tab` tokenizer packages

### Step 4: Seed Demo Data
Populate the database with the clinician demo account and three realistic clinical test cases:
```bash
npm run seed
```
Demo Credentials:
- **Email**: `demo@verisumm.com`
- **Password**: `demo1234`

---

## 4. Running the Platform

### Single Root Command (Recommended)
Start the Backend, Frontend, and FastAPI Model Service concurrently:
```bash
npm run dev
```

### Starting Services Individually
If you prefer running services in separate terminal tabs:

1. **Model Service** (FastAPI on Port 8000):
   ```bash
   cd model-service
   ../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload
   ```

2. **Backend API** (Express + TypeScript on Port 3001):
   ```bash
   npm run dev --prefix backend
   ```

3. **Frontend UI** (Vite + React on Port 5173):
   ```bash
   npm run dev --prefix frontend
   ```

Access the web interface at: **`http://localhost:5173`**

---

## 5. Environment Variables

The backend and frontend can be configured via environment variables (or `.env` file in `/backend`):

| Variable | Default | Purpose |
| :--- | :--- | :--- |
| `PORT` | `3001` | Express backend listening port |
| `MONGO_URI` | `mongodb://localhost:27017/verisumm` | MongoDB connection string (auto-falls back to in-memory) |
| `JWT_SECRET` | `verisumm-clinical-jwt-secret-key-2026` | Secret key used to sign JWT auth tokens |
| `MODEL_SERVICE_URL` | `http://localhost:8000` | Address of the Python FastAPI model microservice |
| `HF_HUB_OFFLINE` | `1` | Forces Hugging Face transformers to operate fully offline |
| `VITE_API_URL` | `http://localhost:3001` | Backend API base URL for frontend Vite client |

---

## 6. Model Registry & Swapping Models

Models are defined in a clean registry dictionary in `model-service/summarizer.py`:

| Key | Model ID | Recommended Use Case |
| :--- | :--- | :--- |
| `pegasus-pubmed` | `google/pegasus-pubmed` | Scientific publications, biomedical literature, trial abstracts (Default) |
| `bart-large-cnn` | `facebook/bart-large-cnn` | Clinical progress notes, discharge summaries, general clinical narratives |
| `distilbart-cnn` | `sshleifer/distilbart-cnn-12-6` | Resource-constrained or CPU-only environments (fastest) |
| `lead-3` | *Extractive Baseline* | Extractive first-3 sentences; 0% generative hallucination risk |

### Adding or Swapping a Model:
1. Open `model-service/summarizer.py`.
2. Add your model identifier to `MODEL_REGISTRY`:
   ```python
   MODEL_REGISTRY["biogpt-sum"] = "microsoft/biogpt"
   ```
3. Add the key to `frontend/src/types/index.ts` and `frontend/src/pages/NewSummaryPage.tsx`.
4. Run `python scripts/download_models.py --models microsoft/biogpt` to cache weights.

---

## 7. Factual Verification Algorithm & Threshold Tuning

### Algorithm Breakdown
Each generated summary sentence $t_j$ undergoes four rigorous checks:

1. **Equation 1 Cosine Support ($sup(t_j)$)**:
   $$sup(t_j) = \max_{s_i \in S} \cos\left(e(t_j), e(s_i)\right)$$
   Computed using `sentence-transformers/all-MiniLM-L6-v2`. If $sup(t_j) < \tau$, the sentence is flagged as potentially unsupported. The top-3 candidate evidence sentences are extracted along with their exact character start and end spans in the source text.

2. **Cross-Encoder NLI Entailment**:
   Evaluated with `cross-encoder/nli-deberta-v3-small` against the top-3 evidence sentences. Produces probabilistic scores for `entailment`, `neutral`, and `contradiction`. A contradiction probability $> 0.5$ triggers an automatic `UNSUPPORTED` verdict.

3. **Deterministic Regex & Entity Rule Engine**:
   - **Numeric consistency**: Any number, percentage, p-value, or year present in $t_j$ must exist in the source document.
   - **Dosage normalization**: Dosages with spacing variations (e.g., `5 mg` vs. `5mg`, `500 mcg`) are normalized and verified.
   - **Negation & polarity parity**: Detects negation mismatches (e.g., `no`, `not`, `without`, `absence of`, `denies`) between the summary and the source evidence sentence.

4. **Verdict Synthesis & Document Flag Rate**:
   - `UNSUPPORTED`: $sup < \tau$ OR contradiction $> 0.5$ OR numerical entity missing in source.
   - `WEAK`: $sup \in [\tau, \tau + 0.1)$ OR borderline entailment ($0.3 \le \text{ent} < 0.5$).
   - `SUPPORTED`: Meets all support, entailment, and numerical criteria.
   - **Document Flag Rate**:
     $$H(S) = \frac{1}{m} \sum_{j=1}^m \mathbf{1}[sup(t_j) < \tau]$$

### Tuning the Decision Threshold ($\tau$)
- In the UI, use the **Tau (τ) Slider** ($0.30 - 0.80$):
  - **$\tau = 0.40$ (Permissive)**: Higher sentence retention, fewer flags; suitable for informal notes.
  - **$\tau = 0.50$ (Paper Default)**: Empirically balanced trade-off between hallucination detection and summary conciseness.
  - **$\tau = 0.60$ (Strict)**: Maximum safety filter; recommended for medication dosing and high-acuity reports.

---

## 8. Hallucination Minimization: Generate-Verify-Repair

VeriSumm implements lean active hallucination reduction:
1. **Regeneration on High Risk**: If more than 30% of sentences are marked `UNSUPPORTED`, the pipeline automatically regenerates the summary once using conservative decoding parameters (`num_beams=6`, `repetition_penalty=1.5`). The candidate with the lower flag rate $H(S)$ is preserved.
2. **One-Click Extractive Fallback**: For any flagged `UNSUPPORTED` sentence in the UI, clinicians can click **"Replace with Source"** to replace the hallucinated sentence with its highest-scoring source evidence sentence.
3. **Safety Fallback**: If 100% of sentences fall below $\tau$, the original summary is preserved with an explicit clinical warning banner rather than returning an empty summary.

---

## 9. Benchmark Reproduction (`scripts/evaluate.py`)

To reproduce Table I and Table II from the research paper across the PubMed Summarization test split (`ccdv/pubmed-summarization`):

```bash
# Fast evaluation run on 5 documents:
.venv/bin/python scripts/evaluate.py --n 5

# Full 50-document evaluation benchmark:
.venv/bin/python scripts/evaluate.py --n 50
```

Results are saved to `results/results.json` and `results/results.csv`, and rendered on the **Paper Results** page in the frontend.

---

## 10. Verification Tests & Pytest Suite

Run the unit tests verifying regex numerical checking, dosage normalization, negation mismatch detection, and verdict assignment:

```bash
.venv/bin/pytest model-service/test_verifier.py -v
```

---

## 11. Known Limitations & Scope

1. **Support vs. Absolute Truth**: Verification measures whether a claim is substantiated by the supplied source text. If the source text itself contains inaccurate medical data, the verifier cannot detect external factual errors.
2. **Domain Discrepancy**: Pretrained models trained primarily on biomedical research (e.g., PubMed) may exhibit syntax variations when processing raw EHR narrative notes.
3. **Mandatory Human Verification**: Automated metrics are screening tools designed to assist, not replace, clinical judgment.
# summarizer
