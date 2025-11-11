/**
 * Jest Test Setup File
 * Configures test environment, database connection, and cleanup
 */

const mongoose = require('mongoose');

// Use test database or append _test to the database name
const getTestDatabaseUri = () => {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error('MONGO_URI environment variable is not set');
  }
  
  // If MONGO_URI_TEST is set, use it; otherwise append _test to the database name
  if (process.env.MONGO_URI_TEST) {
    return process.env.MONGO_URI_TEST;
  }
  
  // Replace the database name with a test database name
  const testDbName = process.env.MONGO_DB_NAME || 'tommalu_test';
  const uri = new URL(mongoUri);
  uri.pathname = `/${testDbName}`;
  return uri.toString();
};

// Global setup - runs once before all tests
beforeAll(async () => {
  const testMongoUri = getTestDatabaseUri();
  
  // Close any existing connection first
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.close();
  }
  
  // Connect to test database
  await mongoose.connect(testMongoUri, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    maxPoolSize: 10,
  });
  
  // Set test timeout
  jest.setTimeout(30000);
}, 60000); // 60 second timeout for setup

// Global teardown - runs once after all tests
afterAll(async () => {
  // Only cleanup if connection is still open
  if (mongoose.connection.readyState === 1) {
    try {
      // Clean up all collections
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        const collection = collections[key];
        try {
          await collection.deleteMany({});
        } catch (error) {
          // Ignore errors during cleanup
          console.warn(`Error cleaning up collection ${key}:`, error.message);
        }
      }
    } catch (error) {
      // Ignore cleanup errors
      console.warn('Error during global cleanup:', error.message);
    }
    
    // Close database connection
    try {
      await mongoose.connection.close();
    } catch (error) {
      // Ignore close errors
      console.warn('Error closing connection:', error.message);
    }
  }
}, 30000);

// Note: Individual test files should clean up in their afterAll hooks
// Global cleanup happens in the global afterAll above

// Handle unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Suppress console warnings during tests (optional)
const originalWarn = console.warn;
console.warn = (...args) => {
  // Suppress Mongoose duplicate index warnings during tests
  if (args[0] && typeof args[0] === 'string' && args[0].includes('Duplicate schema index')) {
    return;
  }
  originalWarn.apply(console, args);
};

