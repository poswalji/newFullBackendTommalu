const { error } = require('./logger');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    // Log the error with full context before passing to error handler
    error('Async handler error', {
      message: err.message,
      stack: err.stack,
      name: err.name,
      statusCode: err.statusCode || 500,
      path: req.path,
      method: req.method,
      url: req.originalUrl || req.url,
      ip: req.ip || req.connection?.remoteAddress,
      userAgent: req.get('user-agent'),
      userId: req.user?._id || 'anonymous',
      body: req.body ? JSON.stringify(req.body).substring(0, 500) : undefined, // Limit body size
      params: req.params,
      query: req.query,
      timestamp: new Date().toISOString(),
    });
    next(err);
  });
};

module.exports = asyncHandler;