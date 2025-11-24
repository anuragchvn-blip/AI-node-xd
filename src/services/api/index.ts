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
    const project = await prisma.project.findUnique({
      where: { apiKey: apiKey as string },
      select: { id: true, orgId: true },
    });

    if (!project) {
      logger.warn('Invalid API Key', { apiKey, ip: req.ip });
      return res.status(401).json({ error: 'Invalid API Key' });
    }

    (req as any).project = project;
    next();
  } catch (error) {
    logger.error('Auth DB Error', { error });
    res.status(500).json({ error: 'Authentication failed' });
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

    // Push to Queue
    const job = await addReportJob({
      projectId: project.id,
      testRunId,
      ...payload
    });

    logger.info('Report Queued', { jobId: job.id, testRunId, projectId: project.id });

    res.status(202).json({
      status: 'accepted',
      jobId: job.id,
      testRunId,
      message: 'Report queued for analysis'
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
