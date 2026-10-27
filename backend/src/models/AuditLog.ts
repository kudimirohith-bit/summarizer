import mongoose, { Schema, Document } from 'mongoose';

export type AuditAction =
  | 'submit'
  | 'result'
  | 'flags'
  | 'review_decision'
  | 'approval'
  | 'error';

export interface IAuditLog extends Document {
  summaryId: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  action: AuditAction;
  modelId?: string;
  details: Record<string, unknown>;
  timestamp: Date;
}

const AuditLogSchema = new Schema<IAuditLog>(
  {
    summaryId: { type: Schema.Types.ObjectId, ref: 'Summary', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: ['submit', 'result', 'flags', 'review_decision', 'approval', 'error'],
      required: true,
    },
    modelId: String,
    details: { type: Schema.Types.Mixed, default: {} },
    timestamp: { type: Date, default: Date.now, index: true },
  },
  { versionKey: false }
);

// Append-only: no updates allowed
AuditLogSchema.set('strict', true);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', AuditLogSchema);
