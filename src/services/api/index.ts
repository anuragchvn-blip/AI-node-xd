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

// Global Error Handler - Catches ALL backend errors
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  logger.error('Backend Error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    body: req.body
  });
  
  // Send Slack alert for critical errors
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    import('../notification/NotificationService').then(({ NotificationService }) => {
      const notificationService = new NotificationService();
      notificationService.sendSlackNotification(slackWebhook, {
        projectName: 'Backend API',
        commitHash: process.env.GITHUB_SHA || 'unknown',
        branch: process.env.GITHUB_REF || 'unknown',
        author: 'Backend System',
        failureMessage: err.message,
        aiAnalysis: `**Backend Error Detected**\n\n*Endpoint:* ${req.method} ${req.url}\n*Error:* ${err.message}\n*Stack:* ${err.stack?.substring(0, 200)}`,
        recommendations: ['Check server logs', 'Verify database connection', 'Review recent changes']
      }).catch(() => {});
    });
  }
  
  res.status(err.status || 500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'An error occurred'
  });
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
    
    // Handle both failedTests array and failureLogs string
    let failedTests = payload.failedTests || [];
    let failureLogs = payload.failureLogs || '';
    
    // If failureLogs is provided but failedTests is empty, parse it
    if (failedTests.length === 0 && failureLogs) {
      // Parse failureLogs into failedTests format
      const logLines = failureLogs.split('\n\n');
      failedTests = logLines.map(log => {
        const testMatch = log.match(/Test: (.+)/);
        const errorMatch = log.match(/Error: (.+)/s);
        return {
          testName: testMatch ? testMatch[1] : 'Unknown Test',
          errorMessage: errorMatch ? errorMatch[1] : log,
          stackTrace: log
        };
      });
    }
    
    if (failedTests.length === 0) {
      return res.status(400).json({ error: 'No failed tests provided' });
    }
    
    // Inline processing
    const vectorStore = new VectorStoreService();
    const notificationService = new NotificationService();
    
    // AI Analysis - use failureLogs if available, otherwise construct from failedTests
    if (!failureLogs) {
      failureLogs = failedTests.map(t => `${t.testName}: ${t.errorMessage}`).join('\n');
    }
    const analysis = await vectorStore.analyzeFailure({
      failureLogs,
      gitDiff: payload.gitDiff || 'No git diff provided'
    });
    
    // Generate vector embedding
    const embedding = await vectorStore.generateEmbedding(failureLogs);
    
    // Search for similar patterns
    const similarPatterns = await vectorStore.searchSimilarPatterns({
      projectId: project.id,
      embedding
    });
    
    // Store pattern
    await prisma.failurePattern.create({
      data: {
        id: testRunId,
        projectId: project.id,
        summary: analysis.substring(0, 500),
        errorMessage: failedTests[0].errorMessage,
        stackTrace: failedTests[0].stackTrace,
        affectedFiles: [failedTests[0].testName],
        testName: failedTests[0].testName,
      },
    });
    
    // Get updated credits before sending notification
    const updatedOrg = await prisma.organization.findUnique({
      where: { id: project.orgId },
      select: { creditsBalance: true },
    });
    
    // Send Slack notification (if webhook configured AND not from test)
    const isTestRequest = req.headers['x-test-mode'] === 'true' || payload.commitHash?.includes('-test');
    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook && !isTestRequest) {
      try {
        await notificationService.sendSlackNotification(slackWebhook, {
          projectName: project.repoUrl || 'CI System',
          commitHash: payload.commitHash || 'unknown',
          branch: payload.branch || 'unknown',
          author: payload.author || 'unknown',
          failureMessage: failedTests[0].errorMessage,
          aiAnalysis: analysis,
          recommendations: similarPatterns.length > 0 
            ? [`Similar failure found ${similarPatterns.length} time(s) before`, 'Review previous fixes for guidance']
            : ['This is a new failure pattern', 'No similar issues found in history'],
          creditsUsed: 1,
          creditsRemaining: updatedOrg?.creditsBalance || 0,
          similarPatterns: similarPatterns.length,
          vectorDimensions: embedding.length
        });
        logger.info('Slack notification sent successfully');
      } catch (error: any) {
        logger.error('Slack notification failed', { error: error.message });
      }
    }
    
    // Send email to author (if configured)
    const sendgridApiKey = process.env.SENDGRID_API_KEY;
    if (sendgridApiKey && payload.author) {
      try {
        await notificationService.sendEmailNotification(
          payload.author,
          sendgridApiKey,
          {
            projectName: project.repoUrl || 'CI System',
            commitHash: payload.commitHash || 'unknown',
            branch: payload.branch || 'unknown',
            author: payload.author,
            failureMessage: failedTests[0].errorMessage,
            aiAnalysis: analysis,
            recommendations: similarPatterns.length > 0 
              ? [`Similar failure found ${similarPatterns.length} time(s) before`]
              : ['This is a new failure pattern']
          }
        );
        logger.info('Email notification sent to author', { author: payload.author });
      } catch (error: any) {
        logger.error('Email notification failed', { error: error.message });
      }
    }
    
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
    logger.error('Report submission failed', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Failed to submit report', details: error.message });
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

// Catch uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
  
  // Send Slack alert
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    import('../notification/NotificationService').then(({ NotificationService }) => {
      const notificationService = new NotificationService();
      notificationService.sendSlackNotification(slackWebhook, {
        projectName: 'Backend API - CRITICAL',
        commitHash: process.env.GITHUB_SHA || 'unknown',
        branch: process.env.GITHUB_REF || 'unknown',
        author: 'Backend System',
        failureMessage: error.message,
        aiAnalysis: `**💥 Uncaught Exception - Service Crash Risk**\n\n*Error:* ${error.message}\n*Stack:* ${error.stack?.substring(0, 300)}`,
        recommendations: ['IMMEDIATE ACTION REQUIRED', 'Check server immediately', 'Service may be down']
      }).catch(() => {});
    });
  }
  
  process.exit(1);
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason: any) => {
  logger.error('Unhandled Promise Rejection', { reason });
  
  const slackWebhook = process.env.SLACK_WEBHOOK_URL;
  if (slackWebhook) {
    import('../notification/NotificationService').then(({ NotificationService }) => {
      const notificationService = new NotificationService();
      notificationService.sendSlackNotification(slackWebhook, {
        projectName: 'Backend API - WARNING',
        commitHash: process.env.GITHUB_SHA || 'unknown',
        branch: process.env.GITHUB_REF || 'unknown',
        author: 'Backend System',
        failureMessage: String(reason),
        aiAnalysis: `**⚠️ Unhandled Promise Rejection**\n\n*Reason:* ${String(reason)}`,
        recommendations: ['Review async operations', 'Check database queries', 'Verify external API calls']
      }).catch(() => {});
    });
  }
});

// Graceful Shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully');
  server.close(async () => {
    await prisma.$disconnect();
    logger.info('Process terminated');
  });
});
