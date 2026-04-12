import { connection as redis } from '../config/queue.js';
import logger from '../utils/logger.js';

/**
 * IDEMPOTENCY MIDDLEWARE
 * Prevents duplicate processing of the same request using Redis.
 *
 * Works by:
 * 1. Checking for 'X-Idempotency-Key' header.
 * 2. Creating an atomic 'processing' lock in Redis (5 min TTL).
 * 3. Intercepting response to cache final status/body (24h TTL).
 * 4. Replaying cached response if same key is sent again.
 */
const idempotencyMiddleware = () => {
  return async (req, res, next) => {
    const key = req.headers['x-idempotency-key'];

    // BACKWARD COMPATIBILITY: Skip if no key provided
    if (!key) {
      return next();
    }

    const userId = req.user?.id;
    if (!userId) {
      logger.warn(
        '[Idempotency] Request with key but no authenticated user. Skipping.'
      );
      return next();
    }

    const redisKey = `idempotency:${userId}:${key}`;

    try {
      // 1. Try to acquire the lock (SET if Not Exists)
      // We set status to 'processing' with a 5-minute timeout for the request lifetime.
      const lockAcquired = await redis.set(
        redisKey,
        'processing',
        'NX',
        'EX',
        300
      );

      if (!lockAcquired) {
        // 2. Lock exists - check if it's still processing or finished
        const cachedData = await redis.get(redisKey);

        if (cachedData === 'processing') {
          return res.status(409).json({
            error:
              'This request is already being processed. Please wait or try again later.',
            idempotent: true,
          });
        }

        // 3. Return cached response
        try {
          const { status, body } = JSON.parse(cachedData);
          logger.info(
            `[Idempotency] Replaying cached response for user ${userId}, key ${key}`
          );
          return res.status(status).json(body);
        } catch (parseErr) {
          logger.error(
            `[Idempotency] Failed to parse cached response: ${parseErr.message}`
          );
          // If cache is corrupt, allow retry by deleting and proceeding
          await redis.del(redisKey);
          return next();
        }
      }

      // 4. Lock acquired - intercept response to cache it
      const originalJson = res.json.bind(res);
      const originalStatus = res.status.bind(res);

      let finalStatus = 200;

      res.status = (code) => {
        finalStatus = code;
        return originalStatus(code);
      };

      res.json = async (body) => {
        // Only cache successful or non-retryable responses (2xx, 4xx)
        // 5xx errors should usually allow retry
        if (finalStatus < 500) {
          const payload = JSON.stringify({ status: finalStatus, body });
          // Cache for 24 hours
          await redis.set(redisKey, payload, 'EX', 86400);
        } else {
          // If it was a server error, delete the lock so they can try again
          await redis.del(redisKey);
        }

        return originalJson(body);
      };

      // Ensure we clean up the lock if the request fails without sending JSON
      res.on('finish', async () => {
        if (res.statusCode >= 500) {
          await redis.del(redisKey);
        }
      });

      next();
    } catch (err) {
      logger.error(`[Idempotency] Middleware Error: ${err.message}`);
      // Fallback: Proceed without idempotency if Redis fails
      next();
    }
  };
};

export default idempotencyMiddleware;
