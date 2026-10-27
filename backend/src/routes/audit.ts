import { Router, Response } from 'express';
import { AuditLog } from '../models/AuditLog';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(authenticate);

// GET /api/audit – last 200 audit entries for the authenticated user
router.get('/', async (req: AuthRequest, res: Response): Promise<void> => {
  const logs = await AuditLog.find({ userId: req.userId })
    .sort({ timestamp: -1 })
    .limit(200)
    .lean();
  res.json(logs);
});

export default router;
