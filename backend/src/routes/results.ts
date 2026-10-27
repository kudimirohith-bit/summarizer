import { Router, Request, Response } from 'express';
import path from 'path';
import fs from 'fs';

const router = Router();

const RESULTS_PATH = path.join(__dirname, '..', '..', '..', 'results', 'results.json');

router.get('/', (req: Request, res: Response): void => {
  if (!fs.existsSync(RESULTS_PATH)) {
    res.status(404).json({
      error: 'results.json not found. Run: python scripts/evaluate.py --n 5 (quick) or --n 50 (full).',
      hint: 'python scripts/evaluate.py --n 5 --models lead-3,distilbart-cnn',
    });
    return;
  }
  try {
    const data = JSON.parse(fs.readFileSync(RESULTS_PATH, 'utf8'));
    res.json(data);
  } catch {
    res.status(500).json({ error: 'Failed to parse results.json' });
  }
});

export default router;
