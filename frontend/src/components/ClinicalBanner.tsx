import React from 'react';
import { AlertTriangle, ShieldAlert } from 'lucide-react';

interface ClinicalBannerProps {
  className?: string;
}

export const ClinicalBanner: React.FC<ClinicalBannerProps> = ({ className = '' }) => {
  return (
    <div
      className={`bg-amber-500/10 border-b border-amber-500/30 px-4 py-2.5 text-amber-300 text-xs sm:text-sm font-medium flex items-center justify-center gap-2 backdrop-blur-sm ${className}`}
      role="alert"
    >
      <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
      <span>
        <strong>CLINICAL SAFETY NOTICE:</strong> AI-assisted summary. Requires clinician review before any clinical use.
      </span>
      <span className="hidden md:inline-block bg-amber-500/20 text-amber-200 text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-amber-500/40">
        Safety-First Platform
      </span>
    </div>
  );
};
