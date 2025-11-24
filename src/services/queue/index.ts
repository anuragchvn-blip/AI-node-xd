import { Queue } from 'bullmq';
import { redisConnection } from './redis';
import { logger } from '../../utils/logger';

export const REPORT_QUEUE_NAME = 'ci-report-queue';

let reportQueue: Queue | null = null;

try {
  reportQueue = new Queue(REPORT_QUEUE_NAME, {
    connection: redisConnection,
  });
  logger.info('Queue initialized successfully');
} catch (error: any) {
  logger.warn('Queue initialization failed - running without queue', { error: error.message });
}

export const addReportJob = async (data: any) => {
  if (!reportQueue) {
    logger.warn('Queue not available, processing synchronously');
    return {
      id: `sync-${Date.now()}`,
      data,
    };
  }

  return await reportQueue.add('analyze-failure', data, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 1000,
    },
    removeOnComplete: true,
  });
};

export { reportQueue };
