// server.js
// Entry point for starting the server
// dotenv is already loaded in app.js, but we load it here too for safety
require('dotenv').config();
const app = require('./app');
// Force nodemon restart
const mongoose = require('mongoose');
const http = require('http');
const { info, error } = require('./utils/logger');
const { initializeFirebase } = require('./utils/firebase');

const PORT = process.env.PORT || 5000;
const mongoUri = process.env.MONGO_URI;

// Connect to database and start server
(async () => {
  try {
    // Connect to MongoDB if not already connected
    if (mongoose.connection.readyState !== 1) {
      await mongoose.connect(mongoUri, {
        serverSelectionTimeoutMS: 30000,
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
      });
      info("✅ Database connected successfully 👍", {
        service: "tommalu-backend",
        database: mongoose.connection.name,
        host: mongoose.connection.host,
      });
    }

    // Initialize Firebase (optional - won't crash if not configured)
    try {
      initializeFirebase();
      info("✅ Firebase initialized", {
        service: "tommalu-backend"
      });
    } catch (firebaseErr) {
      error("⚠️ Firebase not initialized (notifications will be disabled)", {
        message: firebaseErr.message,
      });
    }

    // Create HTTP server
    const server = http.createServer(app);

    // Start server
    server.listen(PORT, () => {
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