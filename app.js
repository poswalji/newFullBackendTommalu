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

// Error middleware
app.use((err, req, res, next) => {
  const statusCode = res.statusCode || 500;
  
  // Log error
  logger.error('Error occurred', {
    message: err.message,
    stack: err.stack,
    statusCode,
    path: req.path,
    method: req.method,
    ip: req.ip,
  });
  
  res.status(statusCode).json({
    success: false,
    message: err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

module.exports = app;
