import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const forgotPasswordLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 3, // Limit each email to 3 requests per windowMs
  message: {
    error: 'Too many password reset requests. Please try again after 24 hours.',
  },
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  keyGenerator: (req, res) => {
    // Limit by email if available, otherwise by IP
    return req.body.email || ipKeyGenerator(req.ip);
  },
});

export default forgotPasswordLimiter;
