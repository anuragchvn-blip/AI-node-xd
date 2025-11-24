import express, { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import prisma from '../../db/prisma';
import { addReportJob } from '../queue';
import { v4 as uuidv4 } from 'uuid';
import paymentService from '../payment/PaymentService';
import { logger } from '../../utils/logger';
import { ReportPayloadSchema, CreateOrderSchema, VerifyPaymentSchema } from '../../utils/validation';
import { z } from 'zod';

dotenv.config();

const app = express();
const PORT = process.env.API_SERVICE_PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Request Logging Middleware
app.use((req, res, next) => {
  logger.info('Incoming Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', { ip: req.ip });
    res.status(429).json({ error: 'Too many requests, please try again later.' });
  },
});
app.use(limiter);

// Authentication Middleware
const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    logger.warn('Missing API Key', { ip: req.ip });
    return res.status(401).json({ error: 'Missing x-api-key header' });
  }

  try {
    logger.info('Authenticating request', { apiKey: apiKey as string });
    const project = await prisma.project.findUnique({
      where: { apiKey: apiKey as string },
      select: { id: true, orgId: true },
    });

    if (!project) {
      logger.warn('Invalid API Key - project not found', { apiKey, ip: req.ip });
      return res.status(401).json({ error: 'Invalid API Key' });
    }

    logger.info('Authentication successful', { projectId: project.id, orgId: project.orgId });
    (req as any).project = project;
    next();
  } catch (error: any) {
    logger.error('Auth DB Error', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Authentication failed', details: error.message });
  }
};

// Health check
app.get('/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', service: 'api-ingestion' });
});

/**
 * POST /api/v1/report
 */
app.post('/api/v1/report', authenticate, async (req: Request, res: Response) => {
  try {
    // Validate Input
    const payload = ReportPayloadSchema.parse(req.body);
    const project = (req as any).project;

    // Check Credits using Prisma
    const org = await prisma.organization.findUnique({
      where: { id: project.orgId },
      select: { creditsBalance: true },
    });

    if (!org || org.creditsBalance <= 0) {
      logger.warn('Insufficient credits', { orgId: project.orgId });
      return res.status(402).json({ 
        error: 'Insufficient credits. Please top up.',
        code: 'PAYMENT_REQUIRED'
      });
    }

    const testRunId = uuidv4();

    // Import services for inline processing
    const { VectorStoreService } = await import('../api/VectorStoreService');
    const { NotificationService } = await import('../notification/NotificationService');
    
    logger.info('Processing report inline (queue disabled)');
    
    // Inline processing
    const vectorStore = new VectorStoreService();
    const notificationService = new NotificationService();
    
    // AI Analysis
    const analysis = await vectorStore.analyzeFailure(payload.failures);
    
    // Generate vector embedding
    const embedding = await vectorStore.generateEmbedding(JSON.stringify(payload.failures));
    
    // Search for similar patterns
    const similarPatterns = await vectorStore.searchSimilarPatterns(embedding, project.id);
    
    // Store pattern
    await prisma.failurePattern.create({
      data: {
        id: testRunId,
        projectId: project.id,
        summary: analysis.substring(0, 500),
        errorMessage: payload.failures[0]?.error || 'Unknown error',
        stackTrace: payload.failures[0]?.stackTrace,
        affectedFiles: payload.failures.map((f: any) => f.test || ''),
        testName: payload.failures[0]?.test,
        embedding: `[${embedding.join(',')}]`,
      },
    });
    
    // Send Slack notification
    await notificationService.sendSlackNotification({
      testRunId,
      analysis,
      similarPatterns: similarPatterns.length,
    });
    
    // Deduct credits
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: project.orgId },
        data: { creditsBalance: { decrement: 1 } },
      });
      
      await tx.usageLog.create({
        data: {
          projectId: project.id,
          actionType: 'ai_analysis',
          cost: 1,
        },
      });
    });
    
    // Get updated credits
    const updatedOrg = await prisma.organization.findUnique({
      where: { id: project.orgId },
      select: { creditsBalance: true },
    });
    
    logger.info('Report processed inline successfully', { testRunId });
    
    res.json({
      status: 'processed',
      testRunId,
      analysis,
      similarPatterns: similarPatterns.length,
      similarPatternsDetails: similarPatterns.map((p: any) => ({
        id: p.id,
        similarity: `${(p.similarity * 100).toFixed(1)}%`,
        summary: p.summary
      })),
      creditsUsed: 1,
      creditsRemaining: updatedOrg?.creditsBalance || 0,
      vectorEmbeddingDimensions: embedding.length,
      message: 'Analysis complete with AI, vector search, and billing'
    });

  } catch (error: any) {
    if (error instanceof z.ZodError) {
      logger.warn('Validation Error', { errors: error.errors });
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Report submission failed', { error });
    res.status(500).json({ error: 'Failed to submit report' });
  }
});

/**
 * POST /api/v1/payments/create-order
 */
app.post('/api/v1/payments/create-order', authenticate, async (req: Request, res: Response) => {
  try {
    const { amount, credits } = CreateOrderSchema.parse(req.body);
    const project = (req as any).project;

    const order = await paymentService.createOrder(project.orgId, amount, credits);
    
    logger.info('Payment Order Created', { orderId: order.id, orgId: project.orgId });
    res.json(order);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Order creation failed', { error });
    res.status(500).json({ error: 'Order creation failed' });
  }
});

/**
 * POST /api/v1/payments/verify
 */
app.post('/api/v1/payments/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const params = VerifyPaymentSchema.parse(req.body);

    const success = await paymentService.verifyPayment(params);

    if (success) {
      logger.info('Payment Verified', { paymentId: params.razorpay_payment_id });
      res.json({ status: 'success', message: 'Payment verified and credits added' });
    } else {
      logger.warn('Invalid Payment Signature', { paymentId: params.razorpay_payment_id });
      res.status(400).json({ status: 'failed', error: 'Invalid signature' });
    }
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Validation failed', details: error.errors });
    }
    logger.error('Payment verification failed', { error });
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled Error', { error: err });
  res.status(500).json({ error: 'Internal Server Error' });
});

const server = app.listen(PORT, () => {
  logger.info(`Ingestion API running on port ${PORT}`);
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Process terminated');
  });
});
