// firebase.js - Firebase Realtime Database setup for backend
const admin = require('firebase-admin');

let db = null;

// Initialize Firebase Admin SDK
exports.initializeFirebase = () => {
  try {
    // Check if Firebase is already initialized
    if (admin.apps.length > 0) {
      db = admin.database();
      return db;
    }

    // Initialize Firebase Admin with service account or default credentials
    // Option 1: Use service account key file (recommended for production)
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
    // Option 2: Use environment variables for individual fields
    else if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }
    // Option 3: Use default credentials (for Google Cloud environments)
    else {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
    }

    db = admin.database();
    console.log('✅ Firebase Admin initialized successfully');
    return db;
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    throw error;
  }
};

// Get Firebase Database instance
exports.getDB = () => {
  if (!db) {
    throw new Error('Firebase not initialized. Call initializeFirebase first.');
  }
  return db;
};

// Helper functions to write to Firebase Realtime Database
exports.emitToUser = (userId, event, data) => {
  try {
    const db = exports.getDB();
    const userRef = db.ref(`notifications/${userId}`);
    const notificationRef = userRef.push();
    notificationRef.set({
      event,
      data,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      read: false
    });
  } catch (error) {
    console.warn('Firebase emit failed for user:', error.message);
  }
};

exports.emitToStoreOwner = (storeOwnerId, event, data) => {
  try {
    const db = exports.getDB();
    const storeOwnerIdString = storeOwnerId?._id?.toString() || storeOwnerId?.toString() || storeOwnerId;
    const userRef = db.ref(`notifications/${storeOwnerIdString}`);
    const notificationRef = userRef.push();
    notificationRef.set({
      event,
      data,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      read: false
    });
  } catch (error) {
    console.warn('Firebase emit failed for store owner:', error.message);
  }
};

exports.emitToAdmin = (event, data) => {
  try {
    const db = exports.getDB();
    const adminRef = db.ref('notifications/role:admin');
    const notificationRef = adminRef.push();
    notificationRef.set({
      event,
      data,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      read: false
    });
  } catch (error) {
    console.warn('Firebase emit failed for admin:', error.message);
  }
};

exports.emitToRole = (role, event, data) => {
  try {
    const db = exports.getDB();
    const roleRef = db.ref(`notifications/role:${role}`);
    const notificationRef = roleRef.push();
    notificationRef.set({
      event,
      data,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      read: false
    });
  } catch (error) {
    console.warn('Firebase emit failed for role:', error.message);
  }
};

exports.emitToAll = (event, data) => {
  try {
    const db = exports.getDB();
    const allRef = db.ref('notifications/all');
    const notificationRef = allRef.push();
    notificationRef.set({
      event,
      data,
      timestamp: admin.database.ServerValue.TIMESTAMP,
      read: false
    });
  } catch (error) {
    console.warn('Firebase emit failed for all:', error.message);
  }
};

// Helper to write notification directly to user's notification path
exports.writeNotification = (userId, notification) => {
  try {
    const db = exports.getDB();
    const userRef = db.ref(`notifications/${userId}`);
    const notificationRef = userRef.push();
    notificationRef.set({
      ...notification,
      timestamp: admin.database.ServerValue.TIMESTAMP
    });
    return notificationRef.key;
  } catch (error) {
    console.warn('Firebase write notification failed:', error.message);
    return null;
  }
};

