import AppError from '../utils/AppError.js';
import logger from '../utils/logger.js';
import { config } from '../config/config.js';
import { cleanupRequestAssets } from '../services/assetService.js';

/**
 * Handle Specific Database Errors
 */
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}.`;
  return new AppError(message, 400);
};

const handleDuplicateFieldsDB = (err) => {
  const message = 'Duplicate field value. Please use another value.';
  return new AppError(message, 400);
};

const handleJWTError = () =>
  new AppError('Invalid token. Please log in again!', 401);

const handleJWTExpiredError = () =>
  new AppError('Your token has expired! Please log in again.', 401);

/**
 * Send Detailed Error for Development: Verbose output for debugging.
 */
const sendErrorDev = (err, req, res) => {
  return res.status(err.statusCode).json({
    status: err.status,
    error: err.message,
    message: err.message,
    stack: err.stack,
  });
};

/**
 * Send Sanitized Error for Production: Protective output for end-users.
 */
const sendErrorProd = (err, req, res) => {
  // 1. [SECURITY] Operational Check: Only leak messages for "Trusted" errors (Validation, etc.)
  if (err.isOperational) {
    return res
      .status(err.statusCode)
      .json({ status: err.status, message: err.message });
  }

  // 2. [AUDIT] System Error Logging: Ship full details to the central log aggregator
  logger.error('CRITICAL_SYSTEM_ERROR', {
    status: err.status,
    message: err.message,
    stack: err.stack,
  });

  // 3. [RESPONSE] Opaque generic message to prevent information leakage
  return res
    .status(500)
    .json({ status: 'error', message: 'Something went very wrong!' });
};

/**
 * Global Error Handler Middleware: The system's final safety net.
 */
export default async (err, req, res, next) => {
  // 1. [SIDE EFFECT] Memory Cleanup: Kill any Cloudinary uploads that were part of the failed request
  cleanupRequestAssets(req);

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (config.isProduction) {
    let error = { ...err };
    error.message = err.message;
    error.stack = err.stack;

    // 2. [TRANSFORMATION] Type Mapping: Convert raw library errors (DB, JWT) into standardized AppErrors
    if (err.name === 'CastError') error = handleCastErrorDB(error);
    if (err.code === 'ER_DUP_ENTRY') error = handleDuplicateFieldsDB(error);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    // 3. [VALIDATION] Standardize input validation errors as operational
    if (err.isJoi || err.name === 'ValidationError') {
      error.statusCode = 400;
      error.isOperational = true;
    }

    // [C11 FIX] Safety Net: Ensure all unmapped 4xx client errors are treated as operational
    // This prevents generic 500s for valid but unmapped business logic exceptions.
    if (
      !error.isOperational &&
      error.statusCode >= 400 &&
      error.statusCode < 500
    ) {
      error.isOperational = true;
    }

    sendErrorProd(error, req, res);
  } else {
    sendErrorDev(err, req, res);
  }
};
