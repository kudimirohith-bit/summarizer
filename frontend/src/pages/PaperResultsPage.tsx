import React, { useState, useEffect } from 'react';
import {
  BarChart3,
  BookOpen,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  ShieldCheck,
  Zap,
  TrendingDown,
  Terminal,
  Layers
} from 'lucide-react';
import axios from 'axios';

const BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:3001';

interface EvalMetric {
  rouge1: number;
  rougeL: number;
  bertScore: number;
  flaggedSentencesPct: number;
  summariesWithFlagPct: number;
  secPerDoc: number;
}

interface ModelEvalRow {
  model: string;
  name: string;
  withoutVerification: EvalMetric;
  withVerification: EvalMetric;
}

interface TauSensitivityRow {
  tau: number;
  flaggedSentencesPct: number;
  summariesWithFlagPct: number;
  avgSentencesRetained: number;
}

interface EvaluationResults {
  dataset: string;
  numDocs: number;
  timestamp: string;
  table1: ModelEvalRow[];
  thresholdSensitivity: TauSensitivityRow[];
}

export const PaperResultsPage: React.FC = () => {
  const [results, setResults] = useState<EvaluationResults | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${BASE_URL}/api/results`);
      setResults(res.data);
    } catch (err: any) {
      setError('Evaluation results file not yet generated.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Title & Metadata */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
            Research Reproduction
          </span>
          <span className="text-xs text-slate-500 font-mono">CCDV / PubMed Benchmark</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
          Empirical Benchmark & Evaluation Results
        </h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Direct reproduction of Table I and threshold sensitivity analysis from the VeriSumm clinical verification
          paper across 50 scientific articles from the test split of PubMed Summarization.
        </p>
      </div>

      {/* Methodology Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 sm:p-5 mb-8 flex items-start gap-3.5">
        <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="text-xs sm:text-sm text-slate-300 space-y-1">
          <p className="font-semibold text-white">Evaluation Protocol & Scope Note:</p>
          <p className="text-slate-400">
            <strong>"Flag rate is an automatic proxy, not a human-judged hallucination rate. 50 documents, single run."</strong>
          </p>
          <p className="text-slate-500 text-xs">
            Evaluated using NLTK sentence tokenization, sentence-transformers cosine support (τ=0.5), ROUGE-1/L with Porter
            stemming, and RoBERTa-based BERTScore F1.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center text-center">
          <div className="w-10 h-10 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-sm text-slate-400">Loading benchmark metrics from disk...</p>
        </div>
      ) : error || !results ? (
        /* Empty / Not Generated State with CLI instructions */
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-8 sm:p-12 text-center max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center mx-auto mb-4">
            <Terminal className="w-7 h-7 text-cyan-400" />
          </div>
          <h3 className="text-lg font-bold text-white mb-2">No Precomputed Results Found</h3>
          <p className="text-xs sm:text-sm text-slate-400 mb-6 leading-relaxed">
            Per the safety-first specifications, this platform strictly avoids fabricated mock outputs.
            To generate and populate actual benchmark numbers, execute the offline evaluation script:
          </p>

          <div className="bg-slate-950 border border-slate-800 rounded-xl p-3.5 text-left font-mono text-xs text-cyan-300 mb-6 overflow-x-auto">
            # Run quick evaluation on 5 documents (fast verification):<br />
            <span className="text-white">python scripts/evaluate.py --n 5</span><br /><br />
            # Or run full 50-document evaluation benchmark:<br />
            <span className="text-white">python scripts/evaluate.py --n 50</span>
          </div>

          <button
            onClick={fetchResults}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors"
          >
            Check Again for Results
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Table I: Main Model Comparison */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <h3 className="text-base font-bold text-white">
                  Table I: Summarization Quality vs. Automated Hallucination Flags
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Comparison without verification vs. with automated verification (τ = 0.5)
                </p>
              </div>
              <span className="text-[11px] font-mono text-slate-500">
                N = {results.numDocs} documents • Evaluated {results.timestamp ? new Date(results.timestamp).toLocaleDateString() : 'recently'}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase text-[11px] tracking-wider">
                    <th className="py-3.5 px-4">Model Architecture</th>
                    <th className="py-3.5 px-4 text-center">Verification</th>
                    <th className="py-3.5 px-3 text-right">ROUGE-1</th>
                    <th className="py-3.5 px-3 text-right">ROUGE-L</th>
                    <th className="py-3.5 px-3 text-right">BERTScore F1</th>
                    <th className="py-3.5 px-3 text-right">Flagged Sentences %</th>
                    <th className="py-3.5 px-3 text-right">Docs Flagged %</th>
                    <th className="py-3.5 px-4 text-right">Speed (s/doc)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {results.table1.map((row, idx) => (
                    <React.Fragment key={idx}>
                      {/* Without verification row */}
                      <tr className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-semibold text-white" rowSpan={2}>
                          <div>{row.name}</div>
                          <div className="text-[10px] text-slate-500 font-mono font-normal">{row.model}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700">
                            Without
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono">{(row.withoutVerification.rouge1 * 100).toFixed(1)}</td>
                        <td className="py-3 px-3 text-right font-mono">{(row.withoutVerification.rougeL * 100).toFixed(1)}</td>
                        <td className="py-3 px-3 text-right font-mono">{(row.withoutVerification.bertScore * 100).toFixed(1)}</td>
                        <td className="py-3 px-3 text-right font-mono text-rose-300">
                          {row.withoutVerification.flaggedSentencesPct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-rose-300">
                          {row.withoutVerification.summariesWithFlagPct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400">
                          {row.withoutVerification.secPerDoc.toFixed(2)}s
                        </td>
                      </tr>
                      {/* With verification row */}
                      <tr className="hover:bg-slate-800/30 transition-colors bg-cyan-950/10">
                        <td className="py-3 px-4 text-center">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                            With VeriSumm
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-cyan-300 font-medium">
                          {(row.withVerification.rouge1 * 100).toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-cyan-300 font-medium">
                          {(row.withVerification.rougeL * 100).toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-cyan-300 font-medium">
                          {(row.withVerification.bertScore * 100).toFixed(1)}
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-300 font-bold">
                          {row.withVerification.flaggedSentencesPct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-3 text-right font-mono text-emerald-300 font-bold">
                          {row.withVerification.summariesWithFlagPct.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400">
                          {row.withVerification.secPerDoc.toFixed(2)}s
                        </td>
                      </tr>
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Table II: Threshold Sensitivity (tau 0.4 - 0.6) */}
          {results.thresholdSensitivity && results.thresholdSensitivity.length > 0 && (
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="p-4 sm:p-5 border-b border-slate-800 bg-slate-900/90">
                <h3 className="text-base font-bold text-white">
                  Table II: Threshold Sensitivity Sweep (Cosine Support τ ∈ [0.4, 0.6])
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Trade-off between strict factual filtering and information retention
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-semibold uppercase text-[11px] tracking-wider">
                      <th className="py-3.5 px-4">Threshold τ</th>
                      <th className="py-3.5 px-4 text-center">Filtering Strictness</th>
                      <th className="py-3.5 px-4 text-right">Flagged Sentences %</th>
                      <th className="py-3.5 px-4 text-right">Summaries With ≥1 Flag %</th>
                      <th className="py-3.5 px-4 text-right">Avg. Sentences Retained</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-300">
                    {results.thresholdSensitivity.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-3 px-4 font-mono font-bold text-cyan-300">τ = {row.tau.toFixed(1)}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                              row.tau === 0.4
                                ? 'bg-slate-800 text-slate-300'
                                : row.tau === 0.5
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                            }`}
                          >
                            {row.tau === 0.4 ? 'Permissive' : row.tau === 0.5 ? 'Paper Default (Recommended)' : 'Strict'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{row.flaggedSentencesPct.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right font-mono">{row.summariesWithFlagPct.toFixed(1)}%</td>
                        <td className="py-3 px-4 text-right font-mono text-white">{row.avgSentencesRetained.toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
