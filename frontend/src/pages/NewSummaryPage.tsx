import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Upload, FileText, Cpu, SlidersHorizontal, Zap, ChevronDown } from 'lucide-react';
import { summariesApi } from '../api';
import { ModelKey } from '../types';

const MODELS: { key: ModelKey; label: string; desc: string; tag?: string }[] = [
  { key: 'pegasus-pubmed', label: 'PEGASUS-PubMed', desc: 'Best for scientific articles', tag: 'Default' },
  { key: 'bart-large-cnn', label: 'BART-large-CNN', desc: 'Short clinical notes' },
  { key: 'distilbart-cnn', label: 'DistilBART-CNN', desc: 'Lightweight / slow machines' },
  { key: 'lead-3', label: 'Lead-3', desc: 'Extractive baseline (fast)' },
];

export default function NewSummaryPage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [model, setModel] = useState<ModelKey>('pegasus-pubmed');
  const [tau, setTau] = useState(0.5);
  const [longMode, setLongMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const [showModelDrop, setShowModelDrop] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  function handleFile(file: File) {
    if (!file.name.endsWith('.txt')) {
      setError('Only .txt files are supported');
      return;
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      setText((e.target?.result as string) || '');
      if (!title) setTitle(file.name.replace('.txt', ''));
    };
    reader.readAsText(file);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim() || text.trim().length < 50) {
      setError('Please enter at least 50 characters of text');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await summariesApi.create({
        title: title || 'Untitled',
        text: text.trim(),
        model,
        tau,
        longMode,
      });
      navigate(`/summary/${res.id}`);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } };
      setError(e.response?.data?.error || 'Failed to submit');
    } finally {
      setLoading(false);
    }
  }

  const selectedModel = MODELS.find((m) => m.key === model)!;

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">New Summary</h1>
        <p className="text-slate-400 text-sm mt-1">Paste clinical or biomedical text for AI summarization with factual verification</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Title */}
        <div className="glass-card rounded-xl p-5">
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Title</label>
          <input
            id="summary-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Patient discharge summary - ICU"
            className="w-full bg-surface-700 border border-surface-500 text-white rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-brand-500 transition-colors"
          />
        </div>

        {/* Text input */}
        <div className="glass-card rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Source Text</label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{text.length.toLocaleString()} chars</span>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Upload .txt
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".txt"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
              />
            </div>
          </div>

          {/* Drag & Drop area */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const file = e.dataTransfer.files[0];
              if (file) handleFile(file);
            }}
            className={`relative transition-colors rounded-lg ${dragOver ? 'bg-brand-900/20 border-brand-500' : ''}`}
          >
            <textarea
              id="source-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Paste clinical notes, biomedical abstracts, or research text here...\n\nOr drag & drop a .txt file`}
              className="w-full bg-surface-700 border border-surface-500 text-white rounded-lg px-4 py-3 text-sm focus:outline-none focus:border-brand-500 transition-colors resize-none font-mono"
              rows={12}
            />
          </div>
          {text.length > 4000 && (
            <p className="text-xs text-amber-400 mt-2 flex items-center gap-1">
              <Zap className="w-3 h-3" /> Long document detected. Consider enabling Long Document Mode below.
            </p>
          )}
        </div>

        {/* Settings row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Model selector */}
          <div className="glass-card rounded-xl p-5">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              <Cpu className="inline w-3.5 h-3.5 mr-1" /> Summarization Model
            </label>
            <div className="relative">
              <button
                type="button"
                id="model-selector"
                onClick={() => setShowModelDrop(!showModelDrop)}
                className="w-full bg-surface-700 border border-surface-500 text-white rounded-lg px-4 py-2.5 text-sm flex items-center justify-between hover:border-brand-500 transition-colors"
              >
                <div className="text-left">
                  <div className="font-medium">{selectedModel.label}</div>
                  <div className="text-xs text-slate-400">{selectedModel.desc}</div>
                </div>
                <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showModelDrop ? 'rotate-180' : ''}`} />
              </button>
              {showModelDrop && (
                <div className="absolute z-10 w-full mt-1 bg-surface-700 border border-surface-500 rounded-xl shadow-xl overflow-hidden">
                  {MODELS.map((m) => (
                    <button
                      type="button"
                      key={m.key}
                      onClick={() => { setModel(m.key); setShowModelDrop(false); }}
                      className={`w-full px-4 py-3 text-left text-sm hover:bg-surface-600 transition-colors flex items-center justify-between ${model === m.key ? 'bg-brand-900/40 text-brand-300' : 'text-white'}`}
                    >
                      <div>
                        <div className="font-medium">{m.label}</div>
                        <div className="text-xs text-slate-400">{m.desc}</div>
                      </div>
                      {m.tag && (
                        <span className="text-xs bg-brand-600/30 text-brand-300 px-2 py-0.5 rounded-full">{m.tag}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tau & Long Mode */}
          <div className="glass-card rounded-xl p-5 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  <SlidersHorizontal className="inline w-3.5 h-3.5 mr-1" /> Tau (verification threshold)
                </label>
                <span className="text-brand-400 font-mono font-bold text-sm">{tau.toFixed(2)}</span>
              </div>
              <input
                id="tau-slider"
                type="range"
                min="0.3"
                max="0.8"
                step="0.05"
                value={tau}
                onChange={(e) => setTau(parseFloat(e.target.value))}
                className="w-full accent-brand-500"
              />
              <div className="flex justify-between text-xs text-slate-500 mt-1">
                <span>0.3 (lenient)</span>
                <span>0.8 (strict)</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-white">Long Document Mode</p>
                <p className="text-xs text-slate-400">Chunk → summarize each → combine</p>
              </div>
              <button
                type="button"
                id="long-mode-toggle"
                onClick={() => setLongMode(!longMode)}
                className={`relative w-12 h-6 rounded-full transition-colors duration-200 ${longMode ? 'bg-brand-600' : 'bg-surface-500'}`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${longMode ? 'left-7' : 'left-1'}`}
                />
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Clinical warning */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
          <p className="text-amber-300 text-xs">
            ⚠️ <strong>AI-assisted summary. Requires clinician review before any clinical use.</strong>
            {' '}Verification checks measure text support, not factual truth. PubMed abstracts are not clinical notes.
          </p>
        </div>

        <button
          type="submit"
          id="submit-summary-btn"
          disabled={loading || !text.trim()}
          className="w-full bg-gradient-to-r from-brand-600 to-brand-500 hover:from-brand-500 hover:to-brand-400 text-white font-semibold py-3 rounded-xl transition-all duration-200 shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Submitting...
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              Generate & Verify Summary
            </>
          )}
        </button>
      </form>
    </div>
  );
}
