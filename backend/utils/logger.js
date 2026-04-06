import winston from 'winston';
import 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define log directory (relative to backend root)
const logDirectory = path.join(__dirname, '..', 'logs');

/**
 * Custom Log Format: JSON for Production, Colorized for Development
 */
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
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

// 2. File Transports (Only for non-test environments or specific conditions)
if (process.env.NODE_ENV !== 'test') {
  // ERROR rotation
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

  // COMBINED rotation
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

// Simple wrapper for better dev experience (optional)
export default logger;
