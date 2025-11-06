// app.js
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const morgan = require('morgan');
const mongoose = require('mongoose');
const { swaggerSpec } = require('./docs/swagger');
const { logger, info, error } = require('./utils/logger');
const http = require('http');
const { initializeSocket } = require('./utils/socket');

const app = express();
let httpServer = null;

// MongoDB connection configuration
const mongoUri = process.env.MONGO_URI;
mongoose.set("strictQuery", true);


// Global error handlers - must be defined before routes
process.on('unhandledRejection', (reason, promise) => {
  error('Unhandled Promise Rejection', {
    reason: reason?.message || reason,
    stack: reason?.stack,
    promise: promise.toString(),
    timestamp: new Date().toISOString(),
  });
});

process.on('uncaughtException', (err) => {
  error('Uncaught Exception', {
    message: err.message,
    stack: err.stack,
    name: err.name,
    timestamp: new Date().toISOString(),
  });
  // Exit process for uncaught exceptions as the application is in an undefined state
  process.exit(1);
});

const allowedOrigins = [
  process.env.FRONTEND_URL,
  "https://tommalu.com",
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

// Database connection function
let dbConnectionPromise = null;

const connectDB = async () => {
  if (mongoose.connection.readyState === 1) {
    // Already connected
    return;
  }

  if (!dbConnectionPromise) {
    dbConnectionPromise = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 30000, // Increased timeout for serverless
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    }).then(() => {
      info("✅ Database connected successfully 👍", {
        database: mongoose.connection.name,
        host: mongoose.connection.host,
      });
      return mongoose.connection;
    }).catch((err) => {
      error("❌ Failed to connect to MongoDB", {
        message: err.message,
        stack: err.stack,
      });
      dbConnectionPromise = null; // Reset on error to allow retry
      throw err;
    });
  }

  return dbConnectionPromise;
};

// Middleware to ensure database connection before handling requests
// This must be before routes are registered
app.use(async (req, res, next) => {
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});

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
app.use("/api/notifications", require("./routes/notificationRoutes"));

// 404 handler for undefined routes - must be before error middleware
app.use((req, res, next) => {
  const err = new Error(`Route ${req.originalUrl} not found`);
  err.statusCode = 404;
  next(err);
});

// Error middleware - must be last middleware
app.use((err, req, res, next) => {
  // Determine status code
  let statusCode = err.statusCode || 500;
  
  // Handle MongoDB errors specifically
  if (err.name === 'MongoServerError' || err.name === 'MongoError') {
    // MongoDB validation/duplicate key errors
    if (err.code === 11000) {
      statusCode = 400; // Bad Request for duplicate key
    } else if (err.message && err.message.includes('validation')) {
      statusCode = 400; // Bad Request for validation errors
    } else {
      statusCode = 500; // Internal Server Error for other MongoDB errors
    }
  }
  
  // Handle Mongoose validation errors
  if (err.name === 'ValidationError') {
    statusCode = 400; // Bad Request
  }
  
  // Handle Cast errors (invalid ObjectId, etc.)
  if (err.name === 'CastError') {
    statusCode = 400; // Bad Request
  }
  
  // Ensure we never return 200 for errors
  if (statusCode === 200 || !statusCode) {
    statusCode = 500;
  }
  
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
      type: err.name || 'Error',
      path: req.path || req.originalUrl || req.url,
      method: req.method || 'UNKNOWN',
    },
  };
  
  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = err.stack;
  }
  
  // Add validation errors if present
  if (err.errors && typeof err.errors === 'object') {
    errorResponse.error.errors = err.errors;
  }

  // Add verification token if present (for email verification flow)
  if (err.verificationToken) {
    errorResponse.verificationToken = err.verificationToken;
  }
  
  // Send error response with proper status code (never 200)
  res.status(statusCode).json(errorResponse);
});

// Initialize database connection and start server
// For traditional server, we connect immediately
const PORT = process.env.PORT || 5000;

// Function to initialize Socket.IO if HTTP server is available
const initializeSocketIfAvailable = () => {
  if (httpServer) {
    try {
      initializeSocket(httpServer);
      info("✅ Socket.io initialized", {
        service: "tommalu-backend"
      });
    } catch (err) {
      error("⚠️ Failed to initialize Socket.io", {
        message: err.message,
        stack: err.stack,
      });
    }
  }
};

// Connect to database and start server if not in serverless environment
if (require.main === module) {
  // Running as main module (traditional server, not imported)
  (async () => {
    try {
      await connectDB();
      // Create HTTP server and attach Express app
      httpServer = http.createServer(app);
      // Initialize Socket.IO
      initializeSocketIfAvailable();
      // Start server
      httpServer.listen(PORT, () => {
        info(`🚀 Server running on port ${PORT}`, {
          port: PORT,
          env: process.env.NODE_ENV || 'development',
        });
      });
    } catch (err) {
      error("❌ Failed to start server", {
        message: err.message,
        stack: err.stack,
      });
      process.exit(1);
    }
  })();
} else {
  // Running as imported module (serverless/Vercel)
  // Connection will happen on first request via middleware
  connectDB().catch((err) => {
    error("⚠️ Database connection failed (will retry on first request)", {
      message: err.message,
    });
  });
  
  // Note: Socket.IO requires a persistent HTTP server connection
  // In traditional serverless environments (AWS Lambda, Vercel serverless functions),
  // Socket.IO won't work because each request is a separate function invocation.
  // Socket.IO will only work if:
  // 1. The platform supports persistent WebSocket connections (e.g., Vercel with WebSocket support)
  // 2. The HTTP server is provided by the platform and accessible
  // For now, Socket.IO initialization is skipped in serverless environments
  // If your platform supports WebSockets, you'll need to initialize Socket.IO
  // when you have access to the HTTP server (e.g., in a Vercel serverless function handler)
}

// Export both app and helper functions
module.exports = app;
module.exports.getHttpServer = () => httpServer;

// Helper function to initialize Socket.IO with a provided HTTP server
// Useful for serverless environments that support WebSockets
module.exports.initializeSocketWithServer = (server) => {
  if (server) {
    httpServer = server;
    initializeSocketIfAvailable();
  }
};
