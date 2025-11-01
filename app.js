// app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const morgan = require('morgan');
const { swaggerSpec } = require('./docs/swagger');
const { logger } = require('./utils/logger');

const app = express();

const allowedOrigins = [
  "https://tommalu.netlify.app",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://127.0.0.1:5173",
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(cookieParser());
app.use(express.json());

// HTTP request logger
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev', {
    stream: {
      write: (message) => logger.http(message.trim())
    }
  }));
} else {
  app.use(morgan('combined', {
    stream: {
      write: (message) => logger.http(message.trim())
    }
  }));
}

app.get("/", (req, res) => {
  res.json("Welcome to Tommalu API 🔥🔥🔥");
});

// Swagger setup
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

const swaggerUiOptions = {
  explorer: true,
  swaggerOptions: {
    url: '/api-docs.json',
  },
};

app.use(
  '/api-docs',
  swaggerUi.serveFiles(swaggerSpec, swaggerUiOptions),
  swaggerUi.setup(swaggerSpec, swaggerUiOptions)
);

// Register all routes - must be before error middleware
// Routes are registered here to ensure they're available for Vercel serverless functions
app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/customer", require("./routes/customerRoutes"));
app.use("/api/store-owner", require("./routes/storeOwnerRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/orders", require("./routes/orderRoutes"));
app.use("/api/cart", require("./routes/cartRoutes"));
app.use("/api/public", require("./routes/publicRoutes"));
app.use("/api/categories", require("./routes/categoryRoutes"));
app.use("/api/products", require("./routes/productRoutes"));
app.use("/api/payments", require("./routes/paymentRoutes"));
app.use("/api/reviews", require("./routes/reviewRoutes"));
app.use("/api/promotions", require("./routes/promotionRoutes"));
app.use("/api/disputes", require("./routes/disputeRoutes"));
app.use("/api/payouts", require("./routes/payoutRoutes"));

// 404 handler for undefined routes - must be before error middleware
app.use((req, res, next) => {
  const err = new Error(`Route ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
});

// Error middleware - must be last middleware
app.use((err, req, res, next) => {
  // Determine status code
  const statusCode = err.statusCode || res.statusCode || 500;
  
  // Log error with comprehensive details
  logger.error('Error occurred in request', {
    message: err.message,
    name: err.name || 'Error',
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection?.remoteAddress,
    userAgent: req.get('user-agent'),
    userId: req.user?._id || 'anonymous',
    timestamp: new Date().toISOString(),
    isOperational: err.isOperational || false,
    ...(err.errors && { validationErrors: err.errors }),
  });
  
  // Prepare error response
  const errorResponse = {
    success: false,
    error: {
      message: err.message || 'Internal server error',
      ...(err.name && { type: err.name }),
    },
  };
  
  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = err.stack;
    errorResponse.error.path = req.path;
    errorResponse.error.method = req.method;
  }
  
  // Add validation errors if present
  if (err.errors && typeof err.errors === 'object') {
    errorResponse.error.errors = err.errors;
  }
  
  // Send error response
  res.status(statusCode).json(errorResponse);
});

module.exports = app;
