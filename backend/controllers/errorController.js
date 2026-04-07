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
 * Send Detailed Error for Development
 */
const sendErrorDev = (err, req, res) => {
  return res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
  });
};

/**
 * Send Sanitized Error for Production
 */
const sendErrorProd = (err, req, res) => {
  // 1. Operational, trusted error: send message to client
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  // 2. Programming or other unknown error: don't leak details
  logger.error('ERROR 💥', {
    status: err.status,
    message: err.message,
    stack: err.stack,
  });

  return res.status(500).json({
    status: 'error',
    message: 'Something went very wrong!',
  });
};

/**
 * Global Error Handler Middleware
 */
export default async (err, req, res, next) => {
  // Fire-and-forget immediate cleanup of orphaned files
  cleanupRequestAssets(req);

  err.statusCode = err.statusCode || 500;
  err.status = err.status || 'error';

  if (config.isProduction) {
    let error = { ...err };
    error.message = err.message;
    error.stack = err.stack;

    // Map Specific Library Errors to AppError
    if (err.name === 'CastError') error = handleCastErrorDB(error);
    if (err.code === 'ER_DUP_ENTRY') error = handleDuplicateFieldsDB(error);
    if (err.name === 'JsonWebTokenError') error = handleJWTError();
    if (err.name === 'TokenExpiredError') error = handleJWTExpiredError();

    // Joi Validation Errors
    if (err.isJoi || err.name === 'ValidationError') {
      error.statusCode = 400;
      error.isOperational = true;
    }

    sendErrorProd(error, req, res);
  } else {
    sendErrorDev(err, req, res);
  }
};
