require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const app = require("./app");
const { logger, info, error } = require("./utils/logger");

const mongoUri = process.env.MONGO_URI;
const PORT = process.env.PORT || 5000; // Changed to 5000 to avoid conflict with Next.js

mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false);

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

async function start() {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });

    info("✅ Database connected successfully 👍", {
      database: mongoose.connection.name,
      host: mongoose.connection.host,
    });

    // Import routes *after* connection
    app.use("/api/auth", require("./routes/authRoutes"));
    app.use("/api/customer", require("./routes/customerRoutes"));
    app.use("/api/store-owner", require("./routes/storeOwnerRoutes")); // Fixed: changed from storeOwner to store-owner for consistency
    app.use("/api/admin", require("./routes/adminRoutes"));
    app.use("/api/orders", require("./routes/orderRoutes"));
    app.use("/api/cart", require("./routes/cartRoutes"));
    app.use("/api/public", require("./routes/publicRoutes"));
    app.use("/api/categories", require("./routes/categoryRoutes"));
    app.use("/api/products", require("./routes/productRoutes"));
    
    // New advanced routes
    app.use("/api/payments", require("./routes/paymentRoutes"));
    app.use("/api/reviews", require("./routes/reviewRoutes"));
    app.use("/api/promotions", require("./routes/promotionRoutes"));
    app.use("/api/disputes", require("./routes/disputeRoutes"));
    app.use("/api/payouts", require("./routes/payoutRoutes"));

    app.listen(PORT, () => {
      info(`🚀 Server running on port ${PORT}`, {
        port: PORT,
        env: process.env.NODE_ENV || 'development',
      });
    });
  } catch (err) {
    error("❌ Failed to connect to MongoDB", {
      message: err.message,
      stack: err.stack,
    });
    process.exit(1);
  }
}

start();
