import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import mongoose from 'mongoose';

import authRouter from './routes/auth';
import summariesRouter from './routes/summaries';
import auditRouter from './routes/audit';
import resultsRouter from './routes/results';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// ── Security & parsing ───────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '10mb' }));

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/summaries', summariesRouter);
app.use('/api/audit', auditRouter);
app.use('/api/results', resultsRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// ── Error handler ─────────────────────────────────────────────────────────────
app.use(errorHandler);

// ── DB connection with memory-server fallback ────────────────────────────────
async function connectDB(): Promise<void> {
  const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/verisumm';
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 3000 });
    console.log('[DB] Connected to MongoDB:', uri);
  } catch (err) {
    console.warn('[DB] MongoDB unreachable, falling back to mongodb-memory-server');
    try {
      // Dynamically import to avoid hard dependency
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      const memServer = await MongoMemoryServer.create();
      const memUri = memServer.getUri();
      await mongoose.connect(memUri);
      console.log('[DB] Connected to in-memory MongoDB:', memUri);
    } catch (memErr) {
      console.error('[DB] Memory server also failed:', (memErr as Error).message);
      console.error('[DB] Install mongodb-memory-server: npm install --save-dev mongodb-memory-server');
      process.exit(1);
    }
  }
}

const PORT = parseInt(process.env.PORT || '3001', 10);

connectDB().then(() => {
  app.listen(PORT, () => {
    console.log(`[Server] VeriSumm backend listening on http://localhost:${PORT}`);
  });
});
