const winston = require('winston');
const path = require('path');
const fs = require('fs');

// ------------------------------
// Determine logs directory safely
// ------------------------------
let logsDir;

try {
  // Default to local "logs" directory
  logsDir = path.join(__dirname, '..', 'logs');

  // In serverless (read-only FS), fallback to /tmp
  if (process.env.AWS_EXECUTION_ENV || process.env.VERCEL || process.env.NETLIFY) {
    logsDir = '/tmp/logs';
  }

  // Create logs directory if it doesn't exist
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
} catch (err) {
  console.warn('⚠️ Could not create logs directory, falling back to console only:', err.message);
  logsDir = null;
}

// ------------------------------
// Define log formats
// ------------------------------
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;
    if (Object.keys(meta).length > 0) {
      msg += ` ${JSON.stringify(meta, null, 2)}`;
    }
    return msg;
  })
);

// ------------------------------
// Define transports conditionally
// ------------------------------
const fileTransports = logsDir
  ? [
      new winston.transports.File({
        filename: path.join(logsDir, 'combined.log'),
        maxsize: 5242880, // 5MB
        maxFiles: 5,
      }),
      new winston.transports.File({
        filename: path.join(logsDir, 'error.log'),
        level: 'error',
        maxsize: 5242880,
        maxFiles: 5,
      }),
    ]
  : [];

// ------------------------------
// Create the main logger
// ------------------------------
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: 'tommalu-backend' },
  transports: [
    ...fileTransports,
    ...(process.env.NODE_ENV !== 'production'
      ? [new winston.transports.Console({ format: consoleFormat })]
      : []),
  ],
  exceptionHandlers: logsDir
    ? [
        new winston.transports.File({
          filename: path.join(logsDir, 'exceptions.log'),
          maxsize: 5242880,
          maxFiles: 5,
        }),
      ]
    : [],
  rejectionHandlers: logsDir
    ? [
        new winston.transports.File({
          filename: path.join(logsDir, 'rejections.log'),
          maxsize: 5242880,
          maxFiles: 5,
        }),
      ]
    : [],
});

// ------------------------------
// Helper functions for different log levels
// ------------------------------
const logHelpers = {
  error: (message, meta = {}) => logger.error(message, meta),
  warn: (message, meta = {}) => logger.warn(message, meta),
  info: (message, meta = {}) => logger.info(message, meta),
  http: (message, meta = {}) => logger.http(message, meta),
  debug: (message, meta = {}) => logger.debug(message, meta),
  verbose: (message, meta = {}) => logger.verbose(message, meta),
};

// ------------------------------
// Export the logger and helpers
// ------------------------------
module.exports = {
  logger,
  ...logHelpers,
};
