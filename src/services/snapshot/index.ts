import express, { Request, Response } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import SnapshotService from './SnapshotService';

dotenv.config();

const app = express();
const PORT = process.env.SNAPSHOT_SERVICE_PORT || 3001;

// Security middleware
app.use(helmet());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: 'Too many requests from this IP',
});
app.use(limiter);

// Simple API key authentication
const authenticate = (req: Request, res: Response, next: Function) => {
  const apiKey = req.headers['x-api-key'];
  if (apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

const snapshotService = new SnapshotService();

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'snapshot' });
});

/**
 * POST /snapshot/create
 * Trigger snapshot capture (called only on backend test failure)
 * 
 * Request body:
 * {
 *   "testRunId": "uuid",
 *   "url": "http://localhost:3000",
 *   "viewport": { "width": 1920, "height": 1080 },
 *   "waitForSelector": "#app-loaded" (optional)
 * }
 * 
 * Response:
 * {
 *   "id": "snapshot-uuid",
 *   "testRunId": "test-run-uuid",
 *   "timestamp": "2024-01-15T10:30:00Z",
 *   "screenshotUrl": "https://s3.../screenshot.png",
 *   "htmlDumpUrl": "https://s3.../page.html",
 *   "harUrl": "https://s3.../network.har",
 *   "consoleLogsUrl": "https://s3.../console.log",
 *   "metadata": { ... }
 * }
 */
app.post('/snapshot/create', authenticate, async (req: Request, res: Response) => {
  try {
    const { testRunId, url, viewport, waitForSelector, waitForTimeout } = req.body;

    if (!testRunId || !url) {
      return res.status(400).json({
        error: 'Missing required fields: testRunId, url',
      });
    }

    console.log(`Received snapshot request for test run: ${testRunId}`);

    const result = await snapshotService.captureSnapshot({
      testRunId,
      url,
      viewport,
      waitForSelector,
      waitForTimeout,
    });

    res.json(result);
  } catch (error: any) {
    console.error('Snapshot creation failed:', error);
    res.status(500).json({
      error: 'Snapshot capture failed',
      message: error.message,
    });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  await snapshotService.shutdown();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  await snapshotService.shutdown();
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`Snapshot Service running on port ${PORT}`);
  snapshotService.initialize();
});
