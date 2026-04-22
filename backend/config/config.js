import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize dotenv from backend root
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProduction = NODE_ENV === 'production' || NODE_ENV === 'staging';

/**
 * Centralized Configuration Object
 */
export const config = {
  env: NODE_ENV,
  isProduction,
  isTest: NODE_ENV === 'test',
  port: parseInt(process.env.PORT || '3000', 10),
  db: {
    host: process.env.DB_HOST || (isProduction ? undefined : 'localhost'),
    user: process.env.DB_USER || (isProduction ? undefined : 'root'),
    password:
      process.env.DB_PASSWORD || (isProduction ? undefined : 'password'),
    name: process.env.DB_NAME || (isProduction ? undefined : 'pms_database'),
    port: parseInt(process.env.DB_PORT || '3306', 10),
    ssl: process.env.DB_SSL === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '24h',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  stripe: {
    secretKey: process.env.STRIPE_SECRET_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
  },
  smtp: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

/**
 * Validate that all required configuration is present.
 * Throws a Fatal Error if critical production variables are missing.
 */
export const validateConfig = () => {
  const errors = [];

  // 1. Critical Secrets (Always Required)
  if (!config.jwt.secret) {
    errors.push('JWT_SECRET is missing');
  }

  // 2. Production-Only Requirements (Fail Fast)
  if (isProduction) {
    if (!config.db.host) errors.push('DB_HOST is missing');
    if (!config.db.user) errors.push('DB_USER is missing');
    if (!config.db.password) errors.push('DB_PASSWORD is missing');
    if (!config.db.name) errors.push('DB_NAME is missing');

    // Redis Requirements
    if (!process.env.REDIS_HOST) errors.push('REDIS_HOST is missing');

    // Cloudinary is required for image uploads in production
    if (!config.cloudinary.cloudName)
      errors.push('CLOUDINARY_CLOUD_NAME is missing');
    if (!config.cloudinary.apiKey) errors.push('CLOUDINARY_API_KEY is missing');
    if (!config.cloudinary.apiSecret)
      errors.push('CLOUDINARY_API_SECRET is missing');

    // Payment Gateway is required in production
    if (!config.stripe.secretKey) errors.push('STRIPE_SECRET_KEY is missing');
    if (!config.stripe.publishableKey)
      errors.push('STRIPE_PUBLISHABLE_KEY is missing');
  }

  if (errors.length > 0) {
    console.error('==================================================');
    console.error('FATAL ERROR: CONFIGURATION VALIDATION FAILED');
    errors.forEach((err) => console.error(` - ${err}`));
    console.error('==================================================');
    console.error(
      'The application refuses to start with insecure or missing secrets.'
    );
    process.exit(1);
  }
};

export default config;
