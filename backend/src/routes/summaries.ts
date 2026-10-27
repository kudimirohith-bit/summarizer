import { Router, Response } from 'express';
import { z } from 'zod';
import mongoose from 'mongoose';
import { Summary } from '../models/Summary';
import { AuditLog } from '../models/AuditLog';
import { authenticate, AuthRequest } from '../middleware/auth';
import { enqueue } from '../services/jobRunner';

const router = Router();

// All summary routes require auth
router.use(authenticate);

const CreateSummarySchema = z.object({
  title: z.string().min(1).max(200).default('Untitled'),
  text: z.string().min(50).max(200_000),
  model: z.enum(['pegasus-pubmed', 'bart-large-cnn', 'distilbart-cnn', 'lead-3']).default('pegasus-pubmed'),
  tau: z.number().min(0.3).max(0.8).default(0.5),
  longMode: z.boolean().default(false),
});

const ReviewSchema = z.object({
  sentences: z.array(
    z.object({
      index: z.number().int().min(0),
      status: z.enum(['accepted', 'rejected', 'edited']),
      editedText: z.string().optional(),
    })
  ),
  approve: z.boolean().optional(),
});

// POST /api/summaries – create job
router.post('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = CreateSummarySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { title, text, model, tau, longMode } = parsed.data;
  const userId = req.userId!;

  const summary = await Summary.create({
    userId,
    title,
    sourceText: text,
    model,
    tau,
    longMode,
    status: 'pending',
  });

  // Enqueue async – non-blocking
  enqueue(summary._id.toString());

  res.status(202).json({
    id: summary._id,
    status: summary.status,
    title: summary.title,
    model,
    tau,
    longMode,
    createdAt: summary.createdAt,
  });
});

// GET /api/summaries – history (no text, no sentences returned)
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const summaries = await Summary.find({ userId: req.userId })
    .select('-sourceText -summarySentences -verifiedSummary -extractiveSummary -originalSummary')
    .sort({ createdAt: -1 })
    .limit(100);
  res.json(summaries);
});

// GET /api/summaries/:id – full result (polled by frontend every 2 s)
router.get('/:id', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid summary ID' });
    return;
  }
  const summary = await Summary.findOne({ _id: id, userId: req.userId });
  if (!summary) {
    res.status(404).json({ error: 'Summary not found' });
    return;
  }
  res.json(summary);
});

// POST /api/summaries/:id/review – per-sentence accept/reject/edit + approval
router.post('/:id/review', async (req: AuthRequest, res: Response): Promise<void> => {
  const id = req.params.id as string;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: 'Invalid summary ID' });
    return;
  }

  const parsed = ReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const summary = await Summary.findOne({ _id: req.params.id, userId: req.userId });
  if (!summary) {
    res.status(404).json({ error: 'Summary not found' });
    return;
  }
  if (summary.status !== 'done') {
    res.status(409).json({ error: 'Cannot review a summary that is not done' });
    return;
  }

  const { sentences, approve } = parsed.data;

  // Apply sentence-level review decisions
  for (const s of sentences) {
    if (summary.summarySentences && summary.summarySentences[s.index]) {
      summary.summarySentences[s.index].reviewStatus = s.status;
      if (s.status === 'edited' && s.editedText) {
        summary.summarySentences[s.index].editedText = s.editedText;
      }
    }
  }

  if (approve !== undefined) {
    summary.approved = approve;
    if (approve) summary.approvedAt = new Date();
  }

  summary.markModified('summarySentences');
  await summary.save();

  // Audit: review decision
  await AuditLog.create({
    summaryId: summary._id,
    userId: req.userId,
    action: 'review_decision',
    modelId: summary.model,
    details: {
      numDecisions: sentences.length,
      approve,
    },
  });

  if (approve) {
    await AuditLog.create({
      summaryId: summary._id,
      userId: req.userId,
      action: 'approval',
      modelId: summary.model,
      details: { approvedAt: summary.approvedAt },
    });
  }

  res.json({ ok: true, approved: summary.approved });
});

export default router;
