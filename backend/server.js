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
import { config, validateConfig } from './config/config.js';
import initCronJobs from './utils/cronJobs.js';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './config/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Validate Configuration on Startup (Fail Fast)
validateConfig();

// Initialize the application "Building"
const app = express();
const PORT = config.port;

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
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow images/files to be accessed by frontend
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'frame-ancestors': ["'self'", 'http://localhost:5173'], // Allow frontend to frame backend content
        'img-src': [
          "'self'",
          'data:',
          'blob:',
          'https://res.cloudinary.com',
          '*.payhere.lk',
        ],
        'connect-src': [
          "'self'",
          'http://localhost:3000',
          'https://api.cloudinary.com',
          'https://res.cloudinary.com',
        ],
      },
    },
  })
);
app.use(json());
app.use(express.urlencoded({ extended: true })); // Added for PayHere form data
// Apply Global API Limiter
app.use('/api', apiLimiter);

//  File Server: Allows the frontend to see uploaded images (like receipt photos).
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
  try {
    // Attempt to query the database to verify connectivity
    await db.query('SELECT 1');
    res.json({
      status: 'ok',
      app: 'up',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    logger.error('[Health Check] Database connection failed:', error.message);
    res.status(503).json({
      status: 'error',
      app: 'up',
      database: 'disconnected',
      error: error.message,
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
//  ERROR HANDLING (The Complaint Department)
// ============================================================================
//  If something goes wrong (file too big, database error), this section
//  catches the problem and sends a clear error message back to the user.
// ============================================================================
app.use((err, req, res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res
      .status(413)
      .json({ error: 'File too large. Maximum size is 5MB.' });
  }

  if (err.message === 'Only image files are allowed') {
    return res.status(400).json({ error: err.message });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({ error: 'Duplicate entry' });
  }

  res.status(500).json({
    error: err.message || 'Something went wrong!',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// ============================================================================
//  START SERVER (Opening the Doors)
// ============================================================================
//  Start the scheduled tasks (Cron Jobs) like checking for late payments,
//  and then open the doors to listen for requests on the specified Port.
// ============================================================================

// Only start the server if not running in a test environment
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    logger.info(`Server is running on port ${PORT}`, {
      port: PORT,
      env: process.env.NODE_ENV || 'development',
    });
  });
}

export default app;
