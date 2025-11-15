# Firebase Realtime Database Migration Guide

This document outlines the migration from WebSocket (Socket.IO) to Firebase Realtime Database for real-time notifications.

## Overview

The application has been migrated from Socket.IO to Firebase Realtime Database for real-time communication. This change provides better scalability, serverless compatibility, and eliminates the need for persistent WebSocket connections.

## Backend Changes

### 1. Dependencies

**Removed:**
- `socket.io`

**Added:**
- `firebase-admin`

### 2. Environment Variables

Add the following environment variables to your `.env` file:

```env
# Firebase Configuration
FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com

# Option 1: Service Account Key (Recommended for production)
FIREBASE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...","private_key_id":"...","private_key":"...","client_email":"...","client_id":"...","auth_uri":"...","token_uri":"...","auth_provider_x509_cert_url":"...","client_x509_cert_url":"..."}

# Option 2: Individual Fields (Alternative)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

### 3. Firebase Setup

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project or select an existing one
3. Enable Realtime Database
4. Go to Project Settings > Service Accounts
5. Generate a new private key (downloads JSON file)
6. Copy the contents of the JSON file to `FIREBASE_SERVICE_ACCOUNT_KEY` environment variable, or extract individual fields

### 4. Database Rules

Set up Firebase Realtime Database security rules:

```json
{
  "rules": {
    "notifications": {
      "$userId": {
        ".read": "$userId === auth.uid || root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "false"
      },
      "role:admin": {
        ".read": "root.child('users').child(auth.uid).child('role').val() === 'admin'",
        ".write": "false"
      },
      "role:storeOwner": {
        ".read": "root.child('users').child(auth.uid).child('role').val() === 'storeOwner'",
        ".write": "false"
      },
      "role:customer": {
        ".read": "root.child('users').child(auth.uid).child('role').val() === 'customer'",
        ".write": "false"
      }
    }
  }
}
```

**Note:** Since we're using Firebase Admin SDK on the backend, writes are not restricted by these rules. The rules are for client-side access if needed in the future.

## Frontend Changes

### 1. Dependencies

**Removed:**
- `socket.io-client`

**Added:**
- `firebase`

### 2. Environment Variables

Add the following environment variables to your `.env.local` file:

```env
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_DATABASE_URL=https://your-project-id-default-rtdb.firebaseio.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
```

### 3. Firebase Setup

1. In Firebase Console, go to Project Settings > General
2. Scroll down to "Your apps" section
3. Add a web app if you haven't already
4. Copy the Firebase configuration object
5. Add the values to your `.env.local` file

## Installation

### Backend

```bash
cd newFullBackendTommalu
npm install
# or
pnpm install
```

### Frontend

```bash
cd tommalu_react
npm install
# or
pnpm install
```

## Architecture Changes

### Backend

- **Before:** Socket.IO server with rooms and event emitters
- **After:** Firebase Admin SDK writing to Realtime Database paths

### Frontend

- **Before:** Socket.IO client with event listeners
- **After:** Firebase Realtime Database listeners using `onValue`

## Notification Paths

Notifications are stored in Firebase Realtime Database under the following paths:

- User-specific: `notifications/user:{userId}`
- Role-specific: `notifications/role:{role}` (admin, storeOwner, customer)
- All users: `notifications/all`

## Migration Checklist

- [x] Install Firebase dependencies
- [x] Create Firebase initialization utilities
- [x] Replace Socket.IO with Firebase in backend
- [x] Replace Socket.IO client with Firebase in frontend
- [x] Update notification service
- [x] Update socket context
- [ ] Set up Firebase project and get credentials
- [ ] Add environment variables
- [ ] Configure Firebase Realtime Database rules
- [ ] Test real-time notifications
- [ ] Remove old Socket.IO code (optional cleanup)

## Testing

1. Start the backend server
2. Start the frontend application
3. Create an order as a customer
4. Verify store owner receives notification in real-time
5. Update order status
6. Verify customer receives status update notification
7. Assign delivery to admin
8. Verify admin receives delivery assignment notification

## Troubleshooting

### Backend: Firebase not initialized

- Check that environment variables are set correctly
- Verify Firebase service account key is valid
- Check database URL is correct

### Frontend: Not receiving notifications

- Verify Firebase configuration in `.env.local`
- Check browser console for Firebase errors
- Verify user is authenticated
- Check Firebase Realtime Database rules

### Notifications not appearing

- Check Firebase Realtime Database in Firebase Console
- Verify data is being written to correct paths
- Check browser console for listener errors

## Benefits of Firebase Realtime Database

1. **Serverless Compatible:** Works in serverless environments without persistent connections
2. **Scalable:** Firebase handles scaling automatically
3. **Offline Support:** Built-in offline persistence
4. **No WebSocket Issues:** Eliminates WebSocket connection problems
5. **Better for Mobile:** Works better with mobile apps and background connections
6. **Cost Effective:** Pay only for what you use

## Notes

- The old `utils/socket.js` file is no longer used but kept for reference
- Socket context still exports `socket: null` for backward compatibility
- All notification functionality remains the same from the user's perspective

