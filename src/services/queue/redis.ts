import IORedis from 'ioredis';
import dotenv from 'dotenv';
import { logger } from '../../utils/logger';

dotenv.config();

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redisConnection = new IORedis(redisUrl, {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => {
    if (times > 3) {
      logger.warn('Redis unavailable - queue disabled');
      return null;
    }
    return Math.min(times * 100, 3000);
  },
  lazyConnect: true,
});

redisConnection.on('error', (err) => {
  logger.warn('Redis error - queue disabled', { error: err.message });
});

redisConnection.on('connect', () => {
  logger.info('Redis connected - queue enabled');
});

redisConnection.connect().catch((err) => {
  logger.warn('Redis not available - continuing without queue', { error: err.message });
});
