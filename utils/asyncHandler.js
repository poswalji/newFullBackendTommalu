const { error } = require('./logger');

const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    // Log the error before passing to error handler
    error('Async handler error', {
      message: err.message,
      stack: err.stack,
      path: req.path,
      method: req.method,
    });
    next(err);
  });
};

module.exports = asyncHandler;