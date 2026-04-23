import rateLimit from 'express-rate-limit';

// General rate limiter for all public/guest API routes (protects against basic DoS)
export const guestApiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again after 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiter for form submissions/uploads (protects against spam)
export const guestSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10, // Limit each IP to 10 submissions per hour
  message: {
    error:
      'Too many payment submissions from this IP, please try again after an hour.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
