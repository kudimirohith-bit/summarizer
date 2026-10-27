import mongoose, { Schema, Document } from 'mongoose';

export type JobStatus = 'pending' | 'running' | 'done' | 'failed';
export type Verdict = 'SUPPORTED' | 'WEAK' | 'UNSUPPORTED';
export type TrustLevel = 'High' | 'Medium' | 'Low';

export interface IEvidenceSentence {
  sentence: string;
  score: number;
  start: number;
  end: number;
}

export interface ISummarySentence {
  text: string;
  verdict: Verdict;
  risk: number;
  sup: number;
  entailment: number;
  contradiction: number;
  reasons: string[];
  evidence: IEvidenceSentence[];
  // Review fields
  reviewStatus?: 'accepted' | 'rejected' | 'edited' | 'pending';
  editedText?: string;
}

export interface IDocMetrics {
  flagRate: number;
  percentFlagged: number;
  hasFlagged: boolean;
  trustLevel: TrustLevel;
  secondsGeneration: number;
  secondsVerification: number;
  numSentences: number;
  numFlagged: number;
}

export interface ISummary {
  _id?: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  title: string;
  sourceText: string;
  model: string;
  tau: number;
  longMode: boolean;
  status: JobStatus;
  error?: string;
  // Results
  summarySentences?: ISummarySentence[];
  docMetrics?: IDocMetrics;
  verifiedSummary?: string;
  extractiveSummary?: string;
  originalSummary?: string;
  modelUsed?: string;
  // Review
  approved?: boolean;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const EvidenceSentenceSchema = new Schema<IEvidenceSentence>(
  {
    sentence: String,
    score: Number,
    start: Number,
    end: Number,
  },
  { _id: false }
);

const SummarySentenceSchema = new Schema<ISummarySentence>(
  {
    text: String,
    verdict: { type: String, enum: ['SUPPORTED', 'WEAK', 'UNSUPPORTED'] },
    risk: Number,
    sup: Number,
    entailment: Number,
    contradiction: Number,
    reasons: [String],
    evidence: [EvidenceSentenceSchema],
    reviewStatus: {
      type: String,
      enum: ['accepted', 'rejected', 'edited', 'pending'],
      default: 'pending',
    },
    editedText: String,
  },
  { _id: false }
);

const DocMetricsSchema = new Schema<IDocMetrics>(
  {
    flagRate: Number,
    percentFlagged: Number,
    hasFlagged: Boolean,
    trustLevel: { type: String, enum: ['High', 'Medium', 'Low'] },
    secondsGeneration: Number,
    secondsVerification: Number,
    numSentences: Number,
    numFlagged: Number,
  },
  { _id: false }
);

const SummarySchema = new Schema<ISummary>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true },
    sourceText: { type: String, required: true },
    model: { type: String, required: true },
    tau: { type: Number, default: 0.5 },
    longMode: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['pending', 'running', 'done', 'failed'],
      default: 'pending',
      index: true,
    },
    error: String,
    summarySentences: [SummarySentenceSchema],
    docMetrics: DocMetricsSchema,
    verifiedSummary: String,
    extractiveSummary: String,
    originalSummary: String,
    modelUsed: String,
    approved: { type: Boolean, default: false },
    approvedAt: Date,
  },
  { timestamps: true }
);

export const Summary = mongoose.model<ISummary>('Summary', SummarySchema);
