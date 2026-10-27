import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Sparkles,
  Download,
  Check,
  X,
  Edit2,
  RefreshCw,
  ArrowLeft,
  ChevronRight,
  Info,
  Layers,
  FileCheck2,
  Sliders,
  ExternalLink
} from 'lucide-react';
import { summariesApi } from '../api';
import { Summary, SummarySentence, Verdict, TrustLevel } from '../types';
import { ClinicalBanner } from '../components/ClinicalBanner';

type TabMode = 'original' | 'verified' | 'extractive';

export const ResultReviewPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<TabMode>('original');
  const [selectedSentenceIndex, setSelectedSentenceIndex] = useState<number | null>(null);
  const [highlightRange, setHighlightRange] = useState<{ start: number; end: number } | null>(null);

  // Per-sentence review status
  const [sentenceReviews, setSentenceReviews] = useState<{
    [idx: number]: { status: 'accepted' | 'rejected' | 'edited' | 'pending'; text: string; isEditing: boolean };
  }>({});

  const [approving, setApproving] = useState(false);
  const [approvedSuccess, setApprovedSuccess] = useState(false);

  const sourceContainerRef = useRef<HTMLDivElement>(null);
  const highlightSpanRef = useRef<HTMLSpanElement>(null);

  // Poll job status every 2s if pending or running
  useEffect(() => {
    let interval: any = null;

    const fetchSummary = async () => {
      if (!id) return;
      try {
        const data = await summariesApi.getById(id);
        setSummary(data);

        // Initialize review state from sentence list if not initialized
        if (data.summarySentences && Object.keys(sentenceReviews).length === 0) {
          const initialReviews: typeof sentenceReviews = {};
          data.summarySentences.forEach((s, idx) => {
            initialReviews[idx] = {
              status: s.reviewStatus || 'pending',
              text: s.editedText || s.text,
              isEditing: false,
            };
          });
          setSentenceReviews(initialReviews);
        }

        if (data.status === 'done' || data.status === 'failed') {
          setLoading(false);
          if (interval) clearInterval(interval);
        }
      } catch (err: any) {
        setError(err.response?.data?.error || err.message || 'Failed to load summary');
        setLoading(false);
        if (interval) clearInterval(interval);
      }
    };

    fetchSummary();

    interval = setInterval(() => {
      fetchSummary();
    }, 2000);

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [id]);

  // Handle sentence click to scroll to source evidence
  const handleSentenceClick = (idx: number, sentence: SummarySentence) => {
    setSelectedSentenceIndex(idx);
    if (sentence.evidence && sentence.evidence.length > 0) {
      const topEvidence = sentence.evidence[0];
      setHighlightRange({ start: topEvidence.start, end: topEvidence.end });

      setTimeout(() => {
        if (highlightSpanRef.current && sourceContainerRef.current) {
          highlightSpanRef.current.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
          });
        }
      }, 50);
    } else {
      setHighlightRange(null);
    }
  };

  const handleStatusChange = (idx: number, status: 'accepted' | 'rejected') => {
    setSentenceReviews((prev) => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        status: prev[idx]?.status === status ? 'pending' : status,
        isEditing: false,
      },
    }));
  };

  const handleStartEdit = (idx: number) => {
    setSentenceReviews((prev) => ({
      ...prev,
      [idx]: {
        ...prev[idx],
        isEditing: true,
      },
    }));
  };

  const handleSaveEdit = (idx: number, newText: string) => {
    setSentenceReviews((prev) => ({
      ...prev,
      [idx]: {
        status: 'edited',
        text: newText,
        isEditing: false,
      },
    }));
  };

  // Extractive fallback replacement for unsupported sentence
  const handleReplaceWithEvidence = (idx: number, evidenceText: string) => {
    setSentenceReviews((prev) => ({
      ...prev,
      [idx]: {
        status: 'edited',
        text: evidenceText,
        isEditing: false,
      },
    }));
  };

  const handleApproveFinal = async () => {
    if (!id || !summary?.summarySentences) return;
    setApproving(true);
    try {
      const decisions = summary.summarySentences.map((_, idx) => {
        const rev = sentenceReviews[idx];
        return {
          index: idx,
          status: rev?.status && rev.status !== 'pending' ? rev.status : 'accepted',
          editedText: rev?.status === 'edited' ? rev.text : undefined,
        };
      });

      const updated = await summariesApi.review(id, {
        decisions: decisions as any,
        approved: true,
      });
      setSummary(updated);
      setApprovedSuccess(true);
      setTimeout(() => setApprovedSuccess(false), 4000);
    } catch (err: any) {
      alert('Error approving summary: ' + (err.response?.data?.error || err.message));
    } finally {
      setApproving(false);
    }
  };

  const exportAsTxt = () => {
    if (!summary) return;
    let text = `VERISUMM CLINICAL SUMMARY AUDIT REPORT\n`;
    text += `=====================================\n`;
    text += `Title: ${summary.title}\n`;
    text += `Model: ${summary.modelUsed || summary.model}\n`;
    text += `Tau Threshold: ${summary.tau}\n`;
    text += `Trust Level: ${summary.docMetrics?.trustLevel || 'N/A'}\n`;
    text += `Flag Rate: ${((summary.docMetrics?.flagRate || 0) * 100).toFixed(1)}%\n`;
    text += `Generated At: ${new Date(summary.createdAt).toLocaleString()}\n\n`;
    text += `FINAL SUMMARY:\n-------------------------------------\n`;

    if (summary.summarySentences) {
      summary.summarySentences.forEach((s, idx) => {
        const rev = sentenceReviews[idx];
        if (rev?.status !== 'rejected') {
          text += `${rev?.text || s.text} `;
        }
      });
      text += `\n\n`;
    } else {
      text += `${summary.verifiedSummary || summary.originalSummary || ''}\n\n`;
    }

    text += `VERIFICATION BREAKDOWN:\n-------------------------------------\n`;
    summary.summarySentences?.forEach((s, idx) => {
      text += `[#${idx + 1}] [${s.verdict}] (sup: ${s.sup.toFixed(2)}, entailment: ${s.entailment.toFixed(2)}, contradiction: ${s.contradiction.toFixed(2)})\n`;
      text += `Sentence: "${s.text}"\n`;
      if (s.reasons && s.reasons.length > 0) {
        text += `Reasons: ${s.reasons.join('; ')}\n`;
      }
      if (s.evidence && s.evidence.length > 0) {
        text += `Top Evidence: "${s.evidence[0].sentence}" (score: ${s.evidence[0].score.toFixed(2)})\n`;
      }
      text += `\n`;
    });

    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verisumm-${summary._id}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAsJson = () => {
    if (!summary) return;
    const dataToExport = {
      ...summary,
      reviewedSentences: sentenceReviews,
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `verisumm-${summary._id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Render highlighted source text
  const renderSourceText = () => {
    if (!summary) return null;
    const text = summary.sourceText;
    if (!highlightRange) {
      return <span>{text}</span>;
    }

    const { start, end } = highlightRange;
    const clampedStart = Math.max(0, Math.min(start, text.length));
    const clampedEnd = Math.max(clampedStart, Math.min(end, text.length));

    const before = text.slice(0, clampedStart);
    const match = text.slice(clampedStart, clampedEnd);
    const after = text.slice(clampedEnd);

    return (
      <>
        <span>{before}</span>
        <span
          ref={highlightSpanRef}
          className="bg-amber-400/30 text-amber-100 font-semibold px-1 py-0.5 rounded border border-amber-400/50 shadow-sm animate-pulse"
        >
          {match}
        </span>
        <span>{after}</span>
      </>
    );
  };

  if (loading && (!summary || summary.status === 'pending' || summary.status === 'running')) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mb-6 relative">
          <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">
          {summary?.status === 'running' ? 'Running Model & Verification Pipeline...' : 'Initializing Pipeline Job...'}
        </h2>
        <p className="text-sm text-slate-400 max-w-md">
          Executing ingestion, neural summarization, token-level factual checking, and semantic entailment scoring. Polling status...
        </p>
      </div>
    );
  }

  if (error || !summary) {
    return (
      <div className="min-h-[80vh] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-4">
          <XCircle className="w-8 h-8 text-rose-400" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Summary Processing Failed</h2>
        <p className="text-sm text-slate-400 max-w-md mb-6">{error || summary?.error || 'Unknown error occurred'}</p>
        <Link
          to="/"
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          Return to Dashboard
        </Link>
      </div>
    );
  }

  const metrics = summary.docMetrics;
  const isAllFlagged =
    summary.summarySentences &&
    summary.summarySentences.length > 0 &&
    summary.summarySentences.every((s) => s.verdict === 'UNSUPPORTED');

  const getVerdictBadge = (verdict: Verdict) => {
    switch (verdict) {
      case 'SUPPORTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            <CheckCircle2 className="w-3 h-3" /> Supported
          </span>
        );
      case 'WEAK':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/30">
            <AlertTriangle className="w-3 h-3" /> Weak
          </span>
        );
      case 'UNSUPPORTED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/30">
            <XCircle className="w-3 h-3" /> Unsupported
          </span>
        );
    }
  };

  const getVerdictColorClass = (verdict: Verdict, isSelected: boolean) => {
    const base = 'transition-all cursor-pointer rounded p-2 text-sm leading-relaxed border ';
    if (isSelected) {
      return base + 'ring-2 ring-cyan-400 bg-slate-800 border-cyan-500 shadow-md';
    }
    switch (verdict) {
      case 'SUPPORTED':
        return base + 'bg-emerald-950/20 border-emerald-800/40 text-emerald-100 hover:bg-emerald-950/40';
      case 'WEAK':
        return base + 'bg-amber-950/20 border-amber-800/40 text-amber-100 hover:bg-amber-950/40';
      case 'UNSUPPORTED':
        return base + 'bg-rose-950/30 border-rose-800/50 text-rose-100 hover:bg-rose-950/50';
    }
  };

  return (
    <div className="flex flex-col min-h-screen">
      <ClinicalBanner />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-6">
        {/* Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate('/history')}
              className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Back to History"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">{summary.title}</h1>
                {summary.approved && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                    <Check className="w-3.5 h-3.5" /> Clinician Approved
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Model: <span className="text-cyan-400 font-mono">{summary.modelUsed || summary.model}</span> • Tau (τ):{' '}
                <span className="text-cyan-400 font-mono">{summary.tau}</span> • Created:{' '}
                {new Date(summary.createdAt).toLocaleTimeString()}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={exportAsTxt}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export TXT
            </button>
            <button
              onClick={exportAsJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              Export JSON
            </button>
            <button
              onClick={handleApproveFinal}
              disabled={approving}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold shadow-md transition-all ${
                summary.approved || approvedSuccess
                  ? 'bg-emerald-600 text-white hover:bg-emerald-500'
                  : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white'
              }`}
            >
              <Check className="w-3.5 h-3.5" />
              {approving ? 'Approving...' : approvedSuccess ? 'Approved!' : summary.approved ? 'Re-Approve' : 'Approve Final Summary'}
            </button>
          </div>
        </div>

        {/* Metrics Bar */}
        {metrics && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] font-medium text-slate-400">Trust Level</span>
              <div className="mt-1 flex items-center gap-1.5">
                <span
                  className={`text-base font-bold ${
                    metrics.trustLevel === 'High'
                      ? 'text-emerald-400'
                      : metrics.trustLevel === 'Medium'
                      ? 'text-amber-400'
                      : 'text-rose-400'
                  }`}
                >
                  {metrics.trustLevel}
                </span>
                <span className="text-[10px] text-slate-500">Security</span>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] font-medium text-slate-400">Flag Rate H(S)</span>
              <div className="mt-1">
                <span className="text-base font-bold text-white">{(metrics.flagRate * 100).toFixed(1)}%</span>
                <span className="text-[10px] text-slate-500 ml-1">({metrics.numFlagged}/{metrics.numSentences})</span>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] font-medium text-slate-400">Flagged Status</span>
              <div className="mt-1">
                <span
                  className={`text-xs font-semibold px-2 py-0.5 rounded ${
                    metrics.hasFlagged ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}
                >
                  {metrics.hasFlagged ? 'Hallucination Risk' : 'Zero Flags'}
                </span>
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] font-medium text-slate-400">Generation Time</span>
              <div className="mt-1 text-base font-bold text-slate-200">
                {metrics.secondsGeneration ? metrics.secondsGeneration.toFixed(2) : '0.00'}s
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] font-medium text-slate-400">Verification Time</span>
              <div className="mt-1 text-base font-bold text-slate-200">
                {metrics.secondsVerification ? metrics.secondsVerification.toFixed(2) : '0.00'}s
              </div>
            </div>

            <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3">
              <span className="text-[11px] font-medium text-slate-400">Decision Threshold</span>
              <div className="mt-1 text-base font-bold text-cyan-400">τ = {summary.tau}</div>
            </div>
          </div>
        )}

        {/* Warning if 100% sentences were flagged */}
        {isAllFlagged && (
          <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs sm:text-sm text-amber-200">
              <strong className="font-semibold text-amber-300">Safety Fallback Triggered: </strong>
              Every sentence in the generated summary fell below the support threshold (τ={summary.tau}). As specified in the
              clinical paper protocol, the original summary is preserved rather than producing an empty output, and
              immediate human verification is required.
            </div>
          </div>
        )}

        {/* Dual-Pane View: Source on Left, Summary on Right */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* LEFT: Source Document */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl min-h-[600px] max-h-[800px]">
            <div className="p-4 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-cyan-400" />
                <h3 className="font-semibold text-sm text-white">Source Document</h3>
              </div>
              <span className="text-xs text-slate-500 font-mono">
                {summary.sourceText.length} characters • {summary.sourceText.split(/\s+/).length} words
              </span>
            </div>

            <div
              ref={sourceContainerRef}
              className="p-4 overflow-y-auto font-serif text-sm text-slate-300 leading-relaxed whitespace-pre-wrap flex-1 select-text"
            >
              {renderSourceText()}
            </div>

            <div className="p-3 border-t border-slate-800/60 bg-slate-950/40 text-[11px] text-slate-500 flex items-center justify-between">
              <span>Click any summary sentence on the right to pinpoint its top evidence sentence here.</span>
              {highlightRange && (
                <button
                  onClick={() => setHighlightRange(null)}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Clear Highlight
                </button>
              )}
            </div>
          </div>

          {/* RIGHT: Summary & Verification Tabs */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-col overflow-hidden shadow-xl min-h-[600px] max-h-[800px]">
            {/* Tabs Bar */}
            <div className="p-3 border-b border-slate-800 bg-slate-900/95 flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setActiveTab('original')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'original'
                      ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Original (Audited)
                </button>
                <button
                  onClick={() => setActiveTab('verified')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'verified'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Verified Only (sup ≥ τ)
                </button>
                <button
                  onClick={() => setActiveTab('extractive')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeTab === 'extractive'
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Extractive Lead-3
                </button>
              </div>

              <div className="text-xs text-slate-400 flex items-center gap-2">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Supported
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Weak
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Unsupported
                </span>
              </div>
            </div>

            {/* TAB CONTENTS */}
            <div className="p-4 overflow-y-auto flex-1 space-y-4">
              {activeTab === 'original' && (
                <>
                  {summary.summarySentences && summary.summarySentences.length > 0 ? (
                    summary.summarySentences.map((s, idx) => {
                      const isSelected = selectedSentenceIndex === idx;
                      const rev = sentenceReviews[idx];
                      const isRejected = rev?.status === 'rejected';
                      const isAccepted = rev?.status === 'accepted';
                      const isEdited = rev?.status === 'edited';

                      return (
                        <div
                          key={idx}
                          className={`rounded-xl transition-all border p-3 ${
                            isRejected
                              ? 'opacity-40 bg-slate-950/60 border-slate-800'
                              : getVerdictColorClass(s.verdict, isSelected)
                          }`}
                          onClick={() => handleSentenceClick(idx, s)}
                        >
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[11px] font-mono text-slate-400 font-bold">#{idx + 1}</span>
                              {getVerdictBadge(s.verdict)}
                              <span className="text-[10px] text-slate-400 font-mono">
                                sup: <strong>{s.sup.toFixed(2)}</strong> (τ={summary.tau})
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono">
                                ent: <strong>{s.entailment.toFixed(2)}</strong> | cont:{' '}
                                <strong>{s.contradiction.toFixed(2)}</strong>
                              </span>
                            </div>

                            {/* Sentence Action Controls: Accept / Reject / Edit */}
                            <div
                              className="flex items-center gap-1 bg-slate-900/80 p-0.5 rounded-lg border border-slate-700/60"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                onClick={() => handleStatusChange(idx, 'accepted')}
                                title="Accept sentence"
                                className={`p-1 rounded text-xs transition-colors ${
                                  isAccepted
                                    ? 'bg-emerald-600 text-white'
                                    : 'text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleStatusChange(idx, 'rejected')}
                                title="Reject sentence"
                                className={`p-1 rounded text-xs transition-colors ${
                                  isRejected
                                    ? 'bg-rose-600 text-white'
                                    : 'text-slate-400 hover:text-rose-400 hover:bg-slate-800'
                                }`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleStartEdit(idx)}
                                title="Edit sentence"
                                className={`p-1 rounded text-xs transition-colors ${
                                  isEdited
                                    ? 'bg-cyan-600 text-white'
                                    : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-800'
                                }`}
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Sentence Content / Inline Editor */}
                          {rev?.isEditing ? (
                            <div className="mt-2 space-y-2" onClick={(e) => e.stopPropagation()}>
                              <textarea
                                defaultValue={rev.text}
                                id={`edit-sentence-${idx}`}
                                className="w-full bg-slate-950 border border-cyan-500/60 rounded p-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-cyan-400"
                                rows={3}
                              />
                              <div className="flex justify-end gap-2">
                                <button
                                  onClick={() =>
                                    setSentenceReviews((prev) => ({
                                      ...prev,
                                      [idx]: { ...prev[idx], isEditing: false },
                                    }))
                                  }
                                  className="px-2.5 py-1 text-xs text-slate-400 hover:text-white"
                                >
                                  Cancel
                                </button>
                                <button
                                  onClick={() => {
                                    const el = document.getElementById(
                                      `edit-sentence-${idx}`
                                    ) as HTMLTextAreaElement;
                                    handleSaveEdit(idx, el.value);
                                  }}
                                  className="px-3 py-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded"
                                >
                                  Save Edit
                                </button>
                              </div>
                            </div>
                          ) : (
                            <p className={`text-sm ${isRejected ? 'line-through text-slate-500' : ''}`}>
                              {rev?.text || s.text}
                            </p>
                          )}

                          {/* Flag Reasons (if any) */}
                          {s.reasons && s.reasons.length > 0 && (
                            <div className="mt-2.5 pt-2 border-t border-slate-800/60 flex flex-wrap gap-1.5">
                              {s.reasons.map((r, rIdx) => (
                                <span
                                  key={rIdx}
                                  className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-300 bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 rounded"
                                >
                                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                                  {r}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Extractive Fallback: One-click replacement with top evidence sentence */}
                          {s.verdict === 'UNSUPPORTED' && s.evidence && s.evidence.length > 0 && (
                            <div
                              className="mt-2 pt-2 border-t border-slate-800/60 flex items-center justify-between text-xs bg-slate-950/40 p-2 rounded"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="truncate max-w-[70%] text-slate-400">
                                <strong>Extractive fallback:</strong> "{s.evidence[0].sentence}"
                              </div>
                              <button
                                onClick={() => handleReplaceWithEvidence(idx, s.evidence[0].sentence)}
                                className="px-2.5 py-1 bg-cyan-600/30 hover:bg-cyan-600/50 text-cyan-200 border border-cyan-500/40 rounded text-[11px] font-medium transition-colors"
                              >
                                Replace with Source
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-slate-300">{summary.originalSummary}</p>
                  )}
                </>
              )}

              {activeTab === 'verified' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                    <span>
                      Retains only sentences satisfying the support threshold (τ ≥ {summary.tau}). High-risk hallucinations
                      are excised.
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm font-serif text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {summary.verifiedSummary || 'No sentences met the verification criteria.'}
                  </div>
                </div>
              )}

              {activeTab === 'extractive' && (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-xs text-indigo-300 flex items-center gap-2">
                    <Layers className="w-4 h-4 text-indigo-400 shrink-0" />
                    <span>
                      Extractive Baseline (Lead-3 sentences): Zero generative hallucination risk, directly from source text.
                    </span>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-sm font-serif text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {summary.extractiveSummary || 'Extractive summary unavailable.'}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Footer Details */}
            <div className="p-3 border-t border-slate-800/80 bg-slate-950/60 text-xs text-slate-400 flex items-center justify-between">
              <span>{summary.summarySentences?.length || 0} sentences evaluated</span>
              <span className="text-[11px]">Generate-Verify-Repair Pipeline v1.0</span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
