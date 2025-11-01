const { warn, error: logError } = require('./logger');

class AppError extends Error {
  constructor(message, statusCode) {
    super(message);
    this.statusCode = statusCode;
    this.status = `${statusCode}`.startsWith("4") ? "fail" : "error";
    this.isOperational = true; // mark as controlled error

    Error.captureStackTrace(this, this.constructor);
    
    // Log operational errors (4xx = warn, 5xx = error)
    if (statusCode >= 500) {
      logError('Operational error occurred', {
        message,
        statusCode,
        stack: this.stack,
      });
    } else if (statusCode >= 400) {
      warn('Client error occurred', {
        message,
        statusCode,
      });
    }
  }
}
module.exports = AppError;