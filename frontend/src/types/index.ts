// API type definitions for VeriSumm frontend

export type Verdict = 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED';
export type TrustLevel = 'High' | 'Medium' | 'Low';
export type JobStatus = 'pending' | 'running' | 'done' | 'failed';
export type ReviewStatus = 'accepted' | 'rejected' | 'edited' | 'pending';
export type ModelKey = 'pegasus-pubmed' | 'bart-large-cnn' | 'distilbart-cnn' | 'lead-3';

export interface EvidenceSentence {
  sentence: string;
  score: number;
  start: number;
  end: number;
}

export interface SummarySentence {
  text: string;
  verdict: Verdict;
  risk: number;
  sup: number;
  entailment: number;
  contradiction: number;
  reasons: string[];
  evidence: EvidenceSentence[];
  reviewStatus?: ReviewStatus;
  editedText?: string;
}

export interface DocMetrics {
  flagRate: number;
  percentFlagged: number;
  hasFlagged: boolean;
  trustLevel: TrustLevel;
  secondsGeneration: number;
  secondsVerification: number;
  numSentences: number;
  numFlagged: number;
}

export interface Summary {
  _id: string;
  userId: string;
  title: string;
  sourceText: string;
  model: ModelKey;
  tau: number;
  longMode: boolean;
  status: JobStatus;
  error?: string;
  summarySentences?: SummarySentence[];
  docMetrics?: DocMetrics;
  verifiedSummary?: string;
  extractiveSummary?: string;
  originalSummary?: string;
  modelUsed?: string;
  approved?: boolean;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SummaryListItem {
  _id: string;
  title: string;
  model: ModelKey;
  tau: number;
  status: JobStatus;
  approved?: boolean;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface ReviewDecision {
  index: number;
  status: 'accepted' | 'rejected' | 'edited';
  editedText?: string;
}
