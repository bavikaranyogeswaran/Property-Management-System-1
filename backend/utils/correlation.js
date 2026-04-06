import { AsyncLocalStorage } from 'async_hooks';
import { v4 as uuidv4 } from 'uuid';

/**
 * Async Context for Request-Bound Data
 */
export const requestContext = new AsyncLocalStorage();

/**
 * Middleware: Generate or Preserve X-Request-ID
 * Ensures every log in this request cycle can access the same ID.
 */
export const correlationIdMiddleware = (req, res, next) => {
  const requestId = req.get('X-Request-ID') || uuidv4();

  // Set in response header for client-side correlation
  res.setHeader('X-Request-ID', requestId);

  // Wrap the next middleware/handler in the context
  requestContext.run({ requestId }, () => {
    next();
  });
};

/**
 * Helper to get the current Request ID from context
 */
export const getRequestId = () => {
  const store = requestContext.getStore();
  return store ? store.requestId : null;
};
