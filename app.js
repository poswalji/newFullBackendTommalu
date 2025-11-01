// app.js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const swaggerUi = require('swagger-ui-express');
const { swaggerSpec } = require('./docs/swagger');

const app = express();

const allowedOrigins = [
  "https://tommalu.netlify.app",
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
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
  res.status(res.statusCode || 500).json({
    message: err.message,
  });
});

module.exports = app;
