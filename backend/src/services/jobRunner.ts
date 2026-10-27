/**
 * jobRunner.ts – simple in-process async job runner.
 * No external queue needed: jobs run in Node's event loop via setImmediate.
 * Status: pending → running → done/failed.
 * The frontend polls GET /api/summaries/:id every 2 s.
 */
import axios from 'axios';
import { Summary, ISummarySentence, IDocMetrics } from '../models/Summary';
import { AuditLog } from '../models/AuditLog';

const MODEL_SERVICE_URL = process.env.MODEL_SERVICE_URL || 'http://localhost:8000';

interface ModelServiceResponse {
  summary_sentences: {
    text: string;
    verdict: string;
    risk: number;
    sup: number;
    entailment: number;
    contradiction: number;
    reasons: string[];
    evidence: { sentence: string; score: number; start: number; end: number }[];
  }[];
  doc_metrics: {
    flag_rate: number;
    percent_flagged: number;
    has_flagged: boolean;
    trust_level: string;
    seconds_generation: number;
    seconds_verification: number;
    num_sentences: number;
    num_flagged: number;
  };
  verified_summary: string;
  extractive_summary: string;
  model_used: string;
  seconds_generation: number;
  seconds_verification: number;
}

async function appendAudit(
  summaryId: string,
  userId: string,
  action: 'submit' | 'result' | 'flags' | 'review_decision' | 'approval' | 'error',
  modelId: string | undefined,
  details: Record<string, unknown>
): Promise<void> {
  try {
    await AuditLog.create({ summaryId, userId, action, modelId, details });
  } catch (e) {
    console.error('[Audit] Failed to write audit log:', (e as Error).message);
  }
}

export async function runJob(summaryId: string): Promise<void> {
  // Fetch summary doc
  const doc = await Summary.findById(summaryId);
  if (!doc) return;

  // Mark running
  doc.status = 'running';
  await doc.save();

  await appendAudit(summaryId, doc.userId.toString(), 'submit', doc.model, {
    model: doc.model,
    tau: doc.tau,
    longMode: doc.longMode,
    textLength: doc.sourceText.length,
    // Never log text
  });

  try {
    const payload = {
      text: doc.sourceText,
      model: doc.model,
      tau: doc.tau,
      long_mode: doc.longMode,
    };

    const response = await axios.post<ModelServiceResponse>(
      `${MODEL_SERVICE_URL}/summarize-verify`,
      payload,
      { timeout: 300_000 }
    );

    const data = response.data;

    // Map snake_case → camelCase
    const sentences: ISummarySentence[] = data.summary_sentences.map((s) => ({
      text: s.text,
      verdict: s.verdict as ISummarySentence['verdict'],
      risk: s.risk,
      sup: s.sup,
      entailment: s.entailment,
      contradiction: s.contradiction,
      reasons: s.reasons,
      evidence: s.evidence,
      reviewStatus: 'pending',
    }));

    const metrics: IDocMetrics = {
      flagRate: data.doc_metrics.flag_rate,
      percentFlagged: data.doc_metrics.percent_flagged,
      hasFlagged: data.doc_metrics.has_flagged,
      trustLevel: data.doc_metrics.trust_level as IDocMetrics['trustLevel'],
      secondsGeneration: data.doc_metrics.seconds_generation,
      secondsVerification: data.doc_metrics.seconds_verification,
      numSentences: data.doc_metrics.num_sentences,
      numFlagged: data.doc_metrics.num_flagged,
    };

    doc.summarySentences = sentences;
    doc.docMetrics = metrics;
    doc.verifiedSummary = data.verified_summary;
    doc.extractiveSummary = data.extractive_summary;
    doc.originalSummary = sentences.map((s) => s.text).join(' ');
    doc.modelUsed = data.model_used;
    doc.status = 'done';
    await doc.save();

    await appendAudit(summaryId, doc.userId.toString(), 'result', doc.model, {
      model: doc.model,
      secondsGeneration: metrics.secondsGeneration,
      secondsVerification: metrics.secondsVerification,
    });

    if (metrics.hasFlagged) {
      await appendAudit(summaryId, doc.userId.toString(), 'flags', doc.model, {
        flagRate: metrics.flagRate,
        numFlagged: metrics.numFlagged,
        numSentences: metrics.numSentences,
        trustLevel: metrics.trustLevel,
      });
    }
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[Job ${summaryId}] Failed:`, msg);
    doc.status = 'failed';
    doc.error = msg;
    await doc.save();

    await appendAudit(summaryId, doc.userId.toString(), 'error', doc.model, {
      error: msg,
    });
  }
}

/**
 * Enqueue a job to run asynchronously (non-blocking).
 */
export function enqueue(summaryId: string): void {
  setImmediate(() => {
    runJob(summaryId).catch((e) =>
      console.error('[JobRunner] Unhandled error:', (e as Error).message)
    );
  });
}
