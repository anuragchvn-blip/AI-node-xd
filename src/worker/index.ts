import { Worker } from 'bullmq';
import { redisConnection } from '../services/queue/redis';
import { REPORT_QUEUE_NAME } from '../services/queue/index';
import vectorStore from '../services/api/VectorStoreService';
import notificationService from '../services/notification/NotificationService';
import prisma from '../db/prisma';
import { logger } from '../utils/logger';

/**
 * Process a single job from the queue
 */
const processJob = async (job: any) => {
  const { projectId, failureLogs, gitDiff, testRunId, commitHash, branch, author, prNumber } = job.data;
  logger.info('Processing Job', { jobId: job.id, projectId, testRunId });

  try {
    // Get project details
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: { organization: true },
    });

    if (!project) {
      throw new Error('Project not found');
    }

    // 1. Analyze with Groq
    logger.info('Starting Groq Analysis', { jobId: job.id });
    const analysis = await vectorStore.analyzeFailure({
      failureLogs,
      gitDiff,
    });

    // 2. Generate embedding and find similar patterns
    logger.info('Generating embedding and searching patterns', { jobId: job.id });
    let similarPatterns: any[] = [];
    
    try {
      const embedding = await vectorStore.generateEmbedding(`${failureLogs}\n${gitDiff}`);
      similarPatterns = await vectorStore.searchSimilarPatterns({
        projectId,
        embedding,
      });
      logger.info('Similar patterns found', { count: similarPatterns.length });
    } catch (embeddingError: any) {
      logger.warn('Embedding generation skipped (OpenAI key not configured)', { 
        error: embeddingError.message 
      });
    }

    // 3. Save Pattern
    try {
      await vectorStore.insertPattern({
        projectId,
        summary: analysis.substring(0, 200),
        errorMessage: failureLogs.substring(0, 200),
        testName: `Run ${testRunId}`,
      });
    } catch (patternError: any) {
      logger.warn('Pattern storage skipped', { error: patternError.message });
    }

    // 4. Generate recommendations
    const recommendations = [
      'Run integration tests',
      'Check environment variables',
      'Verify database connections',
    ];

    // 5. Send Notifications
    logger.info('Sending notifications', { jobId: job.id });
    
    // Slack notification (if webhook configured)
    const slackWebhook = process.env.SLACK_WEBHOOK_URL;
    if (slackWebhook) {
      await notificationService.sendSlackNotification(slackWebhook, {
        projectName: project.organization.name,
        commitHash,
        branch,
        author,
        failureMessage: failureLogs.substring(0, 200),
        aiAnalysis: analysis,
        recommendations,
      });
    }

    // GitHub PR comment (if PR number and token provided)
    const githubToken = process.env.GITHUB_TOKEN;
    if (prNumber && githubToken && project.repoUrl) {
      const [owner, repo] = project.repoUrl.split('/').slice(-2);
      await notificationService.postGitHubComment(
        owner,
        repo.replace('.git', ''),
        prNumber,
        githubToken,
        {
          projectName: project.organization.name,
          commitHash,
          branch,
          author,
          failureMessage: failureLogs.substring(0, 200),
          aiAnalysis: analysis,
          recommendations,
        }
      );
    }

    // 6. Billing & Usage
    await prisma.$transaction(async (tx) => {
      await tx.organization.update({
        where: { id: project.orgId },
        data: { creditsBalance: { decrement: 1 } },
      });

      await tx.usageLog.create({
        data: {
          projectId,
          actionType: 'analysis',
          cost: 1,
        },
      });
    });

    logger.info('Job Completed Successfully', { 
      jobId: job.id, 
      analysisLength: analysis.length,
      similarPatternsFound: similarPatterns.length,
    });
    
    return { success: true, analysis, similarPatterns, recommendations };

  } catch (error: any) {
    logger.error('Job Failed', { jobId: job.id, error: error.message, stack: error.stack });
    throw error;
  }
};

// Start the Worker
export const startWorker = () => {
  const worker = new Worker(REPORT_QUEUE_NAME, processJob, {
    connection: redisConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5'),
    limiter: {
      max: 10,
      duration: 1000,
    },
  });

  worker.on('completed', (job) => {
    logger.info('Job Completed Event', { jobId: job.id });
  });

  worker.on('failed', (job, err) => {
    logger.error('Job Failed Event', { jobId: job?.id, error: err.message });
  });

  worker.on('error', (err) => {
    logger.error('Worker Error', { error: err.message });
  });

  logger.info('Worker started listening for jobs...');
  
  // Graceful Shutdown
  const gracefulShutdown = async (signal: string) => {
    logger.info(`Received ${signal}, closing worker...`);
    await worker.close();
    await redisConnection.quit();
    await prisma.$disconnect();
    process.exit(0);
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  return worker;
};
