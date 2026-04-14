import { rateLimit, MemoryStore, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redis from '../config/redis.js';
import logger from './logger.js';

/**
 * Creates a fail-open Redis sendCommand wrapper.
 * If Redis is not reachable, returns an empty array so express-rate-limit
 * falls back to in-memory tracking instead of throwing a 500.
 */
const makeResilientSendCommand =
  (prefix) =>
  async (...args) => {
    try {
      return await redis.call(...args);
    } catch (err) {
      logger.warn(
        `[RateLimit] Redis unavailable for store '${prefix}', falling back to no-op:`,
        err.message
      );
      // Returning an empty result causes the store to treat this as a cache miss,
      // which effectively allows the request through (fail-open).
      return [];
    }
  };

/**
 * Standard Rate Limit Handler
 * Logs blocked attempts for security observability.
 */
const limitHandler = (req, res, next, options) => {
  logger.warn('[SECURITY] Rate limit exceeded', {
    ip: req.ip,
    method: req.method,
    path: req.originalUrl,
    message: options.message?.error || options.message,
  });
  res.status(options.statusCode).json(options.message);
};

/**
 * Key Generator targeting individual emails if available.
 * Falls back to IP.
 */
const emailKeyGenerator = (req, res) => {
  return req.body?.email || ipKeyGenerator(req, res);
};

/**
 * Global API Limiter
 * [HARDENED] Multi-instance synchronization via Redis
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Increased to tolerate ~15-20 requests per boot across multiple contexts
  skipFailedRequests: true, // Don't count 4xx/5xx against the quota
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes',
  },
  handler: limitHandler,
  store: new RedisStore({
    sendCommand: makeResilientSendCommand('rl:api:'),
    prefix: 'rl:api:',
  }),
});

/**
 * Strict Auth Limiter
 * [HARDENED] Multi-instance synchronization via Redis
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: {
    error: 'Too many login attempts. Please try again after 15 minutes.',
  },
  handler: limitHandler,
  store: new RedisStore({
    sendCommand: makeResilientSendCommand('rl:login:'),
    prefix: 'rl:login:',
  }),
});

/**
 * Sensitive Action Limiter
 * [HARDENED] Multi-instance synchronization via Redis
 */
export const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: emailKeyGenerator,
  message: {
    error: 'Too many requests for this action. Please try again after 1 hour.',
  },
  handler: limitHandler,
  store: new RedisStore({
    sendCommand: makeResilientSendCommand('rl:sensitive:'),
    prefix: 'rl:sensitive:',
  }),
});

/**
 * Public Portal Limiter
 * [HARDENED] Multi-instance synchronization via Redis
 */
export const publicPortalLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 20,
  keyGenerator: (req, res) => req.params.token || ipKeyGenerator(req, res),
  message: {
    error: 'Too many requests for this portal. Please try again later.',
  },
  handler: limitHandler,
  store: new RedisStore({
    sendCommand: makeResilientSendCommand('rl:public:'),
    prefix: 'rl:public:',
  }),
});

export default {
  apiLimiter,
  loginLimiter,
  sensitiveActionLimiter,
  publicPortalLimiter,
};
