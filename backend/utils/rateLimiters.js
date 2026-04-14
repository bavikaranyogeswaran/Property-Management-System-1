import { rateLimit, MemoryStore, ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import redis from '../config/redis.js';
import logger from './logger.js';

// ============================================================================
//  RESILIENT STORE (Redis → MemoryStore automatic failover)
// ============================================================================
//  The core problem:  rate-limit-redis throws unrecoverable errors when
//  Redis is unreachable, and those errors bubble up as 500s to every request.
//
//  This class implements the express-rate-limit Store interface and proxies
//  every call to a RedisStore.  If ANY store method throws, it catches the
//  error, logs a warning, and delegates to a local MemoryStore instead.
//
//  Result:
//    • Redis healthy  → distributed rate limiting across all instances ✓
//    • Redis down     → per-process in-memory rate limiting (degraded) ✓
//    • Zero 500 errors in either state ✓
// ============================================================================

class ResilientStore {
  /**
   * @param {object} options
   * @param {string} options.prefix - Redis key prefix (e.g. 'rl:api:')
   */
  constructor({ prefix }) {
    this.prefix = prefix;
    this.fallback = new MemoryStore();
    this._redisHealthy = true;

    try {
      this.primary = new RedisStore({
        sendCommand: (...args) => redis.call(...args),
        prefix,
      });
    } catch (err) {
      logger.warn(
        `[RateLimit] Failed to initialize RedisStore for '${prefix}', using MemoryStore:`,
        err.message
      );
      this.primary = null;
      this._redisHealthy = false;
    }
  }

  /**
   * Called by express-rate-limit after construction with the middleware config.
   */
  init(options) {
    this.fallback.init(options);
    try {
      this.primary?.init(options);
    } catch {
      // RedisStore.init can throw if SCRIPT LOAD fails — ignore
    }
  }

  /**
   * Proxy a store method to Redis, falling back to MemoryStore on any error.
   */
  async _proxy(method, ...args) {
    if (this.primary && this._redisHealthy) {
      try {
        const result = await this.primary[method](...args);
        return result;
      } catch (err) {
        // Only log the transition once to avoid spam
        if (this._redisHealthy) {
          this._redisHealthy = false;
          logger.warn(
            `[RateLimit] Redis store '${this.prefix}' failed, falling back to MemoryStore.`,
            { method, error: err.message }
          );
          // Schedule a health re-check after 30 seconds
          this._scheduleRecovery();
        }
      }
    }
    // Fallback to MemoryStore
    return this.fallback[method](...args);
  }

  /**
   * Periodically check if Redis has recovered and switch back.
   */
  _scheduleRecovery() {
    if (this._recoveryTimer) return; // Already scheduled

    this._recoveryTimer = setTimeout(async () => {
      this._recoveryTimer = null;
      try {
        const pong = await redis.ping();
        if (pong === 'PONG') {
          // Re-create the RedisStore with fresh script SHAs
          this.primary = new RedisStore({
            sendCommand: (...args) => redis.call(...args),
            prefix: this.prefix,
          });
          // Re-init with the saved windowMs from MemoryStore
          if (this.fallback.windowMs) {
            this.primary.init({ windowMs: this.fallback.windowMs });
          }
          this._redisHealthy = true;
          logger.info(
            `[RateLimit] Redis recovered for store '${this.prefix}', resuming distributed limiting.`
          );
        } else {
          this._scheduleRecovery();
        }
      } catch {
        // Still down — retry later
        this._scheduleRecovery();
      }
    }, 30_000);

    // Don't block graceful shutdown
    this._recoveryTimer.unref?.();
  }

  // ── Store interface methods ──────────────────────────────────────────

  async get(key) {
    return this._proxy('get', key);
  }

  async increment(key) {
    return this._proxy('increment', key);
  }

  async decrement(key) {
    return this._proxy('decrement', key);
  }

  async resetKey(key) {
    return this._proxy('resetKey', key);
  }

  async resetAll() {
    return this._proxy('resetAll');
  }
}

// ============================================================================
//  RATE LIMIT CONFIGURATION
// ============================================================================

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
 * [HARDENED] Multi-instance synchronization via Redis with MemoryStore fallback
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000, // Increased to tolerate ~15-20 requests per boot across multiple contexts
  skipFailedRequests: true, // Don't count 4xx/5xx against the quota
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes',
  },
  handler: limitHandler,
  store: new ResilientStore({ prefix: 'rl:api:' }),
});

/**
 * Strict Auth Limiter
 * [HARDENED] Multi-instance synchronization via Redis with MemoryStore fallback
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 15,
  message: {
    error: 'Too many login attempts. Please try again after 15 minutes.',
  },
  handler: limitHandler,
  store: new ResilientStore({ prefix: 'rl:login:' }),
});

/**
 * Sensitive Action Limiter
 * [HARDENED] Multi-instance synchronization via Redis with MemoryStore fallback
 */
export const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  keyGenerator: emailKeyGenerator,
  message: {
    error: 'Too many requests for this action. Please try again after 1 hour.',
  },
  handler: limitHandler,
  store: new ResilientStore({ prefix: 'rl:sensitive:' }),
});

/**
 * Public Portal Limiter
 * [HARDENED] Multi-instance synchronization via Redis with MemoryStore fallback
 */
export const publicPortalLimiter = rateLimit({
  windowMs: 30 * 60 * 1000, // 30 minutes
  max: 20,
  keyGenerator: (req, res) => req.params.token || ipKeyGenerator(req, res),
  message: {
    error: 'Too many requests for this portal. Please try again later.',
  },
  handler: limitHandler,
  store: new ResilientStore({ prefix: 'rl:public:' }),
});

export default {
  apiLimiter,
  loginLimiter,
  sensitiveActionLimiter,
  publicPortalLimiter,
};
