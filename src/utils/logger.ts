import winston from 'winston';

const { combine, timestamp, json, colorize, simple, printf } = winston.format;

const devFormat = printf(({ level, message, timestamp, ...metadata }) => {
  let msg = `${timestamp} [${level}]: ${message}`;
  if (Object.keys(metadata).length > 0) {
    msg += ` ${JSON.stringify(metadata)}`;
  }
  return msg;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(timestamp(), json()),
  defaultMeta: { service: 'ci-snapshot-system' },
  transports: [
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' 
        ? combine(timestamp(), json())
        : combine(colorize(), timestamp(), devFormat),
    }),
  ],
});
