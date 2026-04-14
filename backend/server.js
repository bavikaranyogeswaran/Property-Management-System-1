process.env.TZ = 'Asia/Colombo';
// ============================================================================
//  BACKEND ENTRY POINT (The Reception Desk)
// ============================================================================
//  This file is the "Main Entrance" to the backend software.
//  When the website (Frontend) asks for data (like "Get me all tenants"),
//  this file receives that request first and decides who should handle it.
// ============================================================================

import express, { json } from 'express';
import cors from 'cors';
import logger from './utils/logger.js';
import helmet from 'helmet';
import { apiLimiter, publicPortalLimiter } from './utils/rateLimiters.js';
import { correlationIdMiddleware } from './utils/correlation.js';
import { config, validateConfig } from './config/config.js';
import globalErrorHandler from './controllers/errorController.js';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './config/db.js';
import redis from './config/redis.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Monitor for Uncaught Exceptions (e.g., Reference Errors)
process.on('uncaughtException', (err) => {
  logger.error('UNCAUGHT EXCEPTION! 💥 Shutting down...', {
    name: err.name,
    message: err.message,
    stack: err.stack,
  });
  process.exit(1);
});

// Validate Configuration on Startup (Fail Fast)
validateConfig();

// Initialize the application "Building"
const app = express();
const PORT = config.port;

// 2. Defense-in-Depth: Explicitly disable server signature
app.disable('x-powered-by');

// ============================================================================
//  MIDDLEWARE (The Security & Translators)
// ============================================================================
//  These tools run before *every* request.
//  - CORS: Allows the frontend website to talk to this backend.
//  - Helmet: Puts secure locks on the messages (Security Headers).
//  - JSON: Translates incoming messages into a language the app matches (JavaScript Objects).
// ============================================================================
app.use(
  cors({
    origin: config.frontendUrl,
    credentials: true,
  })
);
app.set('trust proxy', 1);

// Configure Environment-Aware Security Headers
const allowedOrigins = [config.frontendUrl];
if (!config.isProduction) {
  allowedOrigins.push('http://localhost:5173');
}

app.use(
  helmet({
    // Standard Hardening
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
    // Comprehensive Content Security Policy
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'frame-ancestors': ["'self'", ...allowedOrigins],
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://res.cloudinary.com',
          '*.payhere.lk',
        ],
        'connect-src': [
          "'self'",
          ...allowedOrigins,
          'https://api.cloudinary.com',
        ],
        'script-src': [
          "'self'",
          'https://www.payhere.lk',
          'https://www.googletagmanager.com',
        ],
        'style-src': [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
        ],
        'font-src': ["'self'", 'https://fonts.gstatic.com'],
      },
    },
  })
);

// Explicitly restrict browser hardware/capabilities (Zero-Trust)
app.use((req, res, next) => {
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), usb=(), bluetooth=()'
  );
  next();
});

app.use(json());
app.use(express.urlencoded({ extended: true })); // Added for PayHere form data
// Apply Correlation ID Middleware (First)
app.use(correlationIdMiddleware);

// Apply Global API Limiter
app.use('/api', apiLimiter);

// NOTE: Local /uploads serving is DEPRECATED in favor of 100% Stateless Cloudinary storage.
// This ensures the application can scale horizontally without file synchronization issues.

// ============================================================================
//  ROUTES (The Department Directory)
// ============================================================================
//  This section tells the building where to send specific requests.
//  Example: "If the request starts with /api/users, send it to the User Department."
// ============================================================================
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import leadRoutes from './routes/leadRoutes.js';
import propertyRoutes from './routes/propertyRoutes.js';
import propertyTypeRoutes from './routes/propertyTypeRoutes.js';
import unitTypeRoutes from './routes/unitTypeRoutes.js';
import unitRoutes from './routes/unitRoutes.js';
import leaseRoutes from './routes/leaseRoutes.js';
import imageRoutes from './routes/imageRoutes.js';
import maintenanceRequestRoutes from './routes/maintenanceRequestRoutes.js';
import maintenanceCostRoutes from './routes/maintenanceCostRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import receiptRoutes from './routes/receiptRoutes.js';
import behaviorRoutes from './routes/behaviorRoutes.js';
import leadPortalRoutes from './routes/leadPortalRoutes.js';
import visitRoutes from './routes/visitRoutes.js';
import notificationRoutes from './routes/notificationRoutes.js';
import reportRoutes from './routes/reportRoutes.js';
import payoutRoutes from './routes/payoutRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import leaseTermRoutes from './routes/leaseTermRoutes.js';
import documentRoutes from './routes/documentRoutes.js';
import payhereRoutes from './routes/payhereRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import renewalRoutes from './routes/renewalRoutes.js';
import systemRoutes from './routes/systemRoutes.js';
import auditRoutes from './routes/auditRoutes.js';
import guestPaymentRoutes from './routes/guestPaymentRoutes.js';

// ... (rest of imports)
app.use('/api/lead-portal', publicPortalLimiter, leadPortalRoutes);

app.get('/api/health', async (req, res) => {
  const timeout = (ms) =>
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout')), ms)
    );

  try {
    // Perform parallel checks for core dependencies
    const results = await Promise.allSettled([
      db.query('SELECT 1'),
      Promise.race([redis.ping(), timeout(2000)]),
    ]);

    const databaseOk = results[0].status === 'fulfilled';
    const redisOk = results[1].status === 'fulfilled';

    const isHealthy = databaseOk && redisOk;

    const healthData = {
      status: isHealthy ? 'ok' : 'degraded',
      app: 'up',
      database: databaseOk ? 'connected' : 'disconnected',
      redis: redisOk ? 'connected' : 'disconnected',
      environment: config.env,
      uptime: process.uptime(),
      memory: process.memoryUsage().rss,
      timestamp: new Date().toISOString(),
    };

    if (!isHealthy) {
      const dbError =
        results[0].status === 'rejected' ? results[0].reason?.message : null;
      const redisError =
        results[1].status === 'rejected' ? results[1].reason?.message : null;

      logger.warn('[Health Check] System DEGRADED:', {
        database: dbError || 'ok',
        redis: redisError || 'ok',
      });

      return res.status(503).json({
        ...healthData,
        error: dbError || redisError || 'Unknown error',
      });
    }

    res.json(healthData);
  } catch (error) {
    logger.error('[Health Check] UNEXPECTED FAILURE:', error.message);
    res.status(503).json({
      status: 'error',
      app: 'up',
      database: 'disconnected',
      redis: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/public/invoice', publicPortalLimiter, guestPaymentRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

app.use('/api/leads', leadRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/property-types', propertyTypeRoutes);
app.use('/api/unit-types', unitTypeRoutes);
app.use('/api/units', unitRoutes);
app.use('/api/leases', leaseRoutes);
app.use('/api/maintenance-requests', maintenanceRequestRoutes);
app.use('/api/maintenance-costs', maintenanceCostRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/receipts', receiptRoutes);
app.use('/api/behavior', behaviorRoutes);
app.use('/api/visits', visitRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/lease-terms', leaseTermRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/payhere', payhereRoutes);
app.use('/api/renewal-requests', renewalRoutes);
app.use('/api/system', systemRoutes);
app.use('/api/audit-logs', auditRoutes);
app.use('/api', imageRoutes);

// ============================================================================
//  GLOBAL ERROR MANAGEMENT (The Security Escort)
// ============================================================================
//  All errors are funneled here to ensure consistent responses and
//  prevent sensitive data (stack traces) from leaking in production.
// ============================================================================
app.use(globalErrorHandler);

// ============================================================================
//  START SERVER (Opening the Doors)
// ============================================================================
//  Start the scheduled tasks (Cron Jobs) like checking for late payments,
//  and then open the doors to listen for requests on the specified Port.
// ============================================================================

import { registerRepeatableJobs } from './utils/cronJobs.js';

// Only start the server if not running in a test environment
if (config.env !== 'test') {
  const server = app.listen(PORT, async () => {
    logger.info(`Server is running on port ${PORT}`, {
      port: PORT,
      env: config.env,
    });

    // F2.1: Register BullMQ Repeatable Jobs at Startup
    try {
      await registerRepeatableJobs();
      logger.info('[Startup] BullMQ repeatable jobs registered.');
    } catch (err) {
      logger.error(
        '[Startup] CRITICAL: Failed to register BullMQ jobs:',
        err.message
      );
    }
  });

  // 2. Monitor for Unhandled Rejections (e.g., Database connection failures)
  process.on('unhandledRejection', (err) => {
    // Redis disconnection is a degradation, not a reason to crash.
    // The ResilientStore and queue guards handle this gracefully.
    const isRedisError =
      err?.code === 'ECONNREFUSED' ||
      err?.code === 'ENOTFOUND' ||
      err?.name === 'MaxRetriesPerRequestError' ||
      err?.message?.includes('Redis') ||
      err?.message?.includes('redis');

    if (isRedisError) {
      logger.warn('Redis-related rejection (non-fatal, suppressed):', {
        name: err.name,
        message: err.message,
      });
      return; // Do NOT crash the server
    }

    logger.error('UNHANDLED REJECTION! 💥 Shutting down...', {
      name: err.name,
      message: err.message,
      stack: err.stack,
    });
    server.close(() => {
      process.exit(1);
    });
  });

  // 3. Handle Graceful Shutdown (SIGTERM/SIGINT) - Crucial for Docker/K8s logic
  const shutdown = (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown...`);
    server.close(async () => {
      logger.info('HTTP server closed.');
      try {
        await db.end();
        logger.info('Database connections closed.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during database shutdown:', err.message);
        process.exit(1);
      }
    });

    // Force shutdown after 10 seconds if graceful shutdown fails
    setTimeout(() => {
      logger.error(
        'Could not close connections in time, forcefully shutting down'
      );
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

export default app;
