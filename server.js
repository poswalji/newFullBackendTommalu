require('dotenv').config();
const express = require("express");
const mongoose = require("mongoose");
const app = require("./app");

const mongoUri = process.env.MONGO_URI;
const PORT = process.env.PORT || 3000;

mongoose.set("strictQuery", true);
mongoose.set("bufferCommands", false);

async function start() {
  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      maxPoolSize: 10,
    });

    console.log("✅ Database connected successfully 👍");

    // Import routes *after* connection
    app.use("/api/auth", require("./routes/authRoutes"));
    app.use("/api/customer", require("./routes/customerRoutes"));
    app.use("/api/storeOwner", require("./routes/storeOwnerRoutes"));
    app.use("/api/admin", require("./routes/adminRoutes"));
    app.use("/api/orders", require("./routes/orderRoutes"));
    app.use("/api/cart", require("./routes/cartRoutes"));
    app.use("/api/public", require("./routes/publicRoutes"));
    app.use("/api/categories", require("./routes/categoryRoutes"));
    app.use("/api/products", require("./routes/productRoutes"));

    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("❌ Failed to connect to MongoDB:", err.message);
    process.exit(1);
  }
}

start();
