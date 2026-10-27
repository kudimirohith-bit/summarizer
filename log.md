# VeriSumm Implementation & Engineering Log

## 1. Project Overview & Execution Summary

- **Platform Name**: VeriSumm (Clinical & Biomedical Text Summarization with Automated Factual Verification)
- **Objective**: Build a runnable, local-first, safety-oriented clinical text summarization and audit platform matching research specifications without cloud dependencies, Docker, or fake outputs.
- **Timestamp**: October 2026
- **Stack**:
  - **Frontend**: React 18, TypeScript 5.7, Vite 5.4, TailwindCSS 3.4, Lucide React, Zustand
  - **Backend**: Node.js 20, Express, TypeScript, Mongoose, Zod, Bcryptjs, JsonWebToken, mongodb-memory-server fallback
  - **Model Microservice**: Python 3.10+, FastAPI, PyTorch, Hugging Face Transformers, Sentence-Transformers, DeBERTa-v3 Cross-Encoder, NLTK
  - **Orchestration**: Single-command runner via root `npm run dev` with `concurrently`

---

## 2. Directory Layout

```
verisum/
├── backend/
│   ├── src/
│   │   ├── index.ts                # Express server entry point, database connection & memory fallback
│   │   ├── middleware/
│   │   │   ├── auth.ts             # JWT authentication middleware
│   │   │   └── errorHandler.ts     # Centralized error handler
│   │   ├── models/
│   │   │   ├── AuditLog.ts         # Append-only audit collection
│   │   │   ├── Summary.ts          # Summaries schema with sentences, verdicts, metrics & review fields
│   │   │   └── User.ts             # Clinician user account model
│   │   ├── routes/
│   │   │   ├── audit.ts            # Audit log retrieval route
│   │   │   ├── auth.ts             # User registration & login with bcrypt
│   │   │   ├── results.ts          # Serves empirical benchmark JSON (results/results.json)
│   │   │   └── summaries.ts        # Summary job creation, polling, and sentence-level reviews
│   │   ├── services/
│   │   │   └── jobRunner.ts        # In-process asynchronous job queue and pipeline orchestrator
│   │   └── types/
│   ├── package.json
│   └── tsconfig.json
│
├── frontend/
│   ├── src/
│   │   ├── api/index.ts            # Typed Axios client with JWT interceptor
│   │   ├── components/
│   │   │   ├── ClinicalBanner.tsx  # Mandatory clinical safety warning banner
│   │   │   └── Navbar.tsx          # Sticky navigation with route indicators and user session
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx        # Sign-in / register interface with demo credentials
│   │   │   ├── HistoryPage.tsx     # Filterable and searchable summary audit log
│   │   │   ├── NewSummaryPage.tsx  # Document input, file upload, model dropdown, tau slider
│   │   │   ├── PaperResultsPage.tsx# Table I & Table II benchmark tables with scientific disclaimers
│   │   │   └── ResultReviewPage.tsx# Dual-pane audit interface with evidence scroll and sentence review
│   │   ├── store/
│   │   │   └── authStore.ts        # Zustand auth store with localStorage persistence
│   │   ├── types/index.ts          # Comprehensive TypeScript interface definitions
│   │   ├── App.tsx                 # Router with protected route guards
│   │   ├── index.css               # Tailwind directives and custom theme styles
│   │   ├── main.tsx                # React DOM mount
│   │   └── vite-env.d.ts           # Vite client environment declarations
│   ├── package.json
│   ├── tailwind.config.js
│   ├── postcss.config.cjs
│   └── vite.config.ts
│
├── model-service/
│   ├── main.py                     # FastAPI application endpoints: /summarize-verify, /models, /health
│   ├── preprocessing.py            # NLTK sentence tokenizer and fragment pruner
│   ├── summarizer.py               # Hugging Face transformers pipeline with beam search and long-document mode
│   ├── verifier.py                 # Multi-signal factual verifier (Eq. 1 cosine, NLI entailment, regex rules)
│   ├── schemas.py                  # Pydantic request/response schemas
│   ├── test_verifier.py            # Pytest test suite covering regex, negation, and verdict logic
│   └── requirements.txt            # Python dependencies
│
├── scripts/
│   ├── download_models.py          # One-time script to fetch and cache model weights
│   ├── evaluate.py                 # Reproduces paper experiment across PubMed test split
│   └── seed.ts                     # Populates demo account (demo@verisumm.com) and 3 clinical test cases
│
├── results/                        # Stores results.json and results.csv from evaluate.py
├── package.json                    # Root workspace runner
├── README.md                       # Complete user and developer documentation
└── log.md                          # Detailed architectural and engineering record
```

---

## 3. Implementation Details by Component

### Stage 1: Ingestion (`model-service/preprocessing.py`)
- Tokenizes raw input into discrete sentences using NLTK `sent_tokenize`.
- Filters out noise and sentence fragments containing 2 words or fewer.
- Preserves accurate character offsets (`start`, `end`) for source evidence tracking.

### Stage 2: Generation (`model-service/summarizer.py`)
- Supported models in registry:
  - `pegasus-pubmed` (`google/pegasus-pubmed`): Specialized for biomedical papers and scientific literature.
  - `bart-large-cnn` (`facebook/bart-large-cnn`): Well-suited for clinical discharge notes and narratives.
  - `distilbart-cnn` (`sshleifer/distilbart-cnn-12-6`): Lightweight variant for CPU execution.
  - `lead-3`: Extractive baseline returning first three sentences.
- Decoding parameters per research specification:
  - `num_beams = 4`
  - `no_repeat_ngram_size = 3`
  - `repetition_penalty = 1.2`
  - `min_length = 50`, `max_length = 200`
  - `do_sample = False`
  - PEGASUS newline tokens (`<n>`) sanitized to standard spaces.
- **Long Document Mode**:
  - Chunks text by sentence boundaries into segments of ~900 tokens.
  - Summarizes each chunk independently, concatenates intermediate summaries, and generates a unified final summary.
  - Always verifies against the complete, unchunked source text.

### Stage 3: Multi-Signal Factual Verification (`model-service/verifier.py`)
- **Semantic Support ($sup(t_j)$)**:
  - Embeds summary sentence and all source sentences using `sentence-transformers/all-MiniLM-L6-v2`.
  - Calculates cosine similarity and takes the maximum: $sup(t_j) = \max_i \cos(e(t_j), e(s_i))$.
  - Identifies top-3 evidence sentences with character spans.
  - Flags potential hallucination if $sup(t_j) < \tau$ (default $\tau = 0.5$).
- **Cross-Encoder NLI Entailment**:
  - Evaluates premise-hypothesis pairs using `cross-encoder/nli-deberta-v3-small`.
  - Computes `entailment`, `neutral`, and `contradiction` probabilities.
  - Flags contradiction if probability $> 0.5$.
- **Deterministic Numerical & Dosage Checks**:
  - Extracts numbers, percentages, p-values, years, and dosages with units (`mg`, `mcg`, `g`, `ml`, `mmHg`).
  - Normalizes spacing (e.g., `5 mg` matches `5mg`).
  - Verifies presence in the source text; flags missing numerical facts.
- **Negation and Polarity Parity**:
  - Detects negation keywords (`no`, `not`, `without`, `absence of`, `denies`, `lacks`) in summary vs. matched evidence sentences.
  - Flags polarity mismatches where an affirmative claim contradicts a negated source assertion.
- **Verdict Function**:
  - `UNSUPPORTED`: $sup < \tau$ OR contradiction $> 0.5$ OR numerical entity missing in source.
  - `WEAK`: $sup \in [\tau, \tau + 0.1)$ OR borderline entailment ($0.3 \le \text{ent} < 0.5$).
  - `SUPPORTED`: Validated across all semantic and numerical checks.
  - Calculates document flag rate $H(S)$ and trust level (`High`, `Medium`, `Low`).

### Stage 4: Hallucination Minimization & Clinician Review
- **Generate-Verify-Repair**: If $>30\%$ of sentences are `UNSUPPORTED`, the pipeline triggers a single re-generation with stricter decoding (`num_beams=6`, `repetition_penalty=1.5`) and retains the candidate with lower $H(S)$.
- **One-Click Extractive Fallback**: Clinicians can swap an `UNSUPPORTED` sentence directly with its top source evidence sentence in the UI.
- **Per-Sentence Review**: Clinicians can accept, reject, or edit sentences, followed by formal final approval.
- **Immutable Audit Log**: Every submission, verification score, flag, and review action is recorded in MongoDB.

---

## 4. Verification and Validation Results

1. **Backend Build**:
   - `npm run build` executed in `backend/`: **Passed with 0 errors**.
   - Verified Mongoose schema interfaces, job runner, and Zod validation.

2. **Frontend Build**:
   - `npm run build` executed in `frontend/`: **Passed with 0 errors**.
   - Output bundle generated in `frontend/dist/`.
   - Verified TypeScript compilation and Tailwind CSS styling.

3. **Database Fallback**:
   - Tested fallback to `mongodb-memory-server` when local MongoDB instance is offline.
   - Tested seeding script creating demo user (`demo@verisumm.com`) and test cases.

4. **Safety Compliance**:
   - Prominent clinical banner rendered across all summary and review pages:
     *"AI-assisted summary. Requires clinician review before any clinical use."*
   - Clean handling of the paper's 100% flag fallback rule (preserving original summary with explicit alert).

---

## 5. Operations & Execution Guide

### Starting the System:
```bash
# Start all three services together:
npm run dev

# Or start individually:
# 1. Model service:
cd model-service && ../.venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --reload

# 2. Backend API:
npm run dev --prefix backend

# 3. Frontend Web App:
npm run dev --prefix frontend
```

### Seeding Test Clinical Notes:
```bash
npm run seed
```

### Running Offline Benchmarks:
```bash
.venv/bin/python scripts/evaluate.py --n 5
```
