import rateLimit from 'express-rate-limit';
import logger from './logger.js';

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
const emailKeyGenerator = (req) => {
  return req.body?.email || req.ip;
};

/**
 * Global API Limiter
 * Standard protection for general system usage (Dashboard browsing, etc.)
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000,
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes',
  },
  handler: limitHandler,
});

/**
 * Strict Auth Limiter
 * Specifically for Login attempts to prevent brute-force.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: {
    error: 'Too many login attempts. Please try again after 15 minutes.',
  },
  handler: limitHandler,
});

/**
 * Sensitive Action Limiter
 * Specifically for Password Reset and Email Verification requests.
 * Uses Email-based throttling to prevent targeted inbox flooding.
 */
export const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: emailKeyGenerator,
  message: {
    error: 'Too many requests for this action. Please try again after 1 hour.',
  },
  handler: limitHandler,
});

/**
 * Public Portal Limiter
 * Specifically for the Lead Portal and Guest Payment routes.
 */
export const publicPortalLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 20,
  message: {
    error: 'Public portal access threshold reached. Please try again later.',
  },
  handler: limitHandler,
});

export default {
  apiLimiter,
  loginLimiter,
  sensitiveActionLimiter,
  publicPortalLimiter,
};
