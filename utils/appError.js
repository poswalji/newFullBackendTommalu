const { warn, error: logError } = require('./logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode || 500;
    this.status = `${this.statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true; // mark as controlled error

    Error.captureStackTrace(this, this.constructor);
    
    // Log operational errors (4xx = warn, 5xx = error)
    // Note: Full logging happens in asyncHandler and error middleware
    if (statusCode >= 500) {
      logError('AppError: Server error', {
        message,
        statusCode: this.statusCode,
      });
    } else if (statusCode >= 400) {
      warn('AppError: Client error', {
        message,
        statusCode: this.statusCode,
      });
    }
  }
}

module.exports = AppError;