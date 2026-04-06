/**
 * AppError Class
 * Used to identify "Operational Errors" (expected errors like validation failures)
 * as opposed to "Programming Errors" (unexpected bugs like undefined references).
 */
class AppError extends Error {
  constructor(message, statusCode) {
    super(message);

    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    this.isOperational = true;

    Error.captureStackTrace(this, this.constructor);
  }
}

export default AppError;
