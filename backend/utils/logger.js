import winston from 'winston';
import 'winston-daily-rotate-file';
import CloudWatchTransport from 'winston-cloudwatch';
import path from 'path';
import { fileURLToPath } from 'url';
import { getRequestId } from './correlation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logDirectory = path.join(__dirname, '..', 'logs');

/**
 * PII Redaction Format
 * Scrubs sensitive keys from metadata before logging.
 */
const redact = winston.format((info) => {
  const sensitiveKeys = ['password', 'token', 'secret', 'cvv', 'creditCard'];
  const redactObject = (obj) => {
    for (const key in obj) {
      if (sensitiveKeys.includes(key.toLowerCase())) {
        obj[key] = '[REDACTED]';
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        redactObject(obj[key]);
      }
    }
  };
  redactObject(info);
  return info;
});

/**
 * Custom Log Format: JSON for Production, Colorized for Development
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  redact(),
  winston.format.splat(),
  // Add Request ID dynamically if available in Async Context
  winston.format((info) => {
    const requestId = getRequestId();
    if (requestId) info.requestId = requestId;
    return info;
  })(),
  winston.format.json()
);

const devFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `[${timestamp}] ${level}: ${message}`;
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }
    return msg;
  })
);

/**
 * Configure Winston Transports
 */
const transports = [
  // 1. Console Transport (Always visible)
  new winston.transports.Console({
    format: process.env.NODE_ENV === 'production' ? logFormat : devFormat,
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  }),
];

/**
 * CloudWatch Transport (Production Only)
 * Only enabled if AWS_CLOUDWATCH_GROUP is provided in environment.
 */
if (process.env.AWS_CLOUDWATCH_GROUP) {
  transports.push(
    new CloudWatchTransport({
      logGroupName: process.env.AWS_CLOUDWATCH_GROUP,
      logStreamName: `${process.env.NODE_ENV || 'production'}-${new Date().toISOString().split('T')[0]}`,
      awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
      awsSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
      awsRegion: process.env.AWS_REGION || 'us-east-1',
      jsonMessage: true,
      retentionInDays: 30,
    })
  );
}

// 2. File Transports (Only for non-test environments)
if (process.env.NODE_ENV !== 'test') {
  transports.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'error',
    })
  );

  transports.push(
    new winston.transports.DailyRotateFile({
      filename: path.join(logDirectory, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      level: 'info',
    })
  );
}

/**
 * Create the Logger Instance
 */
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'pms-backend' },
  transports,
  exitOnError: false,
});

export default logger;
