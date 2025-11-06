// socket.js - Socket.io server setup
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/user');

let io;

// Initialize Socket.io server
exports.initializeSocket = (server) => {
  io = new Server(server, {
    cors: {
      origin: [process.env.FRONTEND_URL," https://tommalu.com/"] || [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:5173",
        "https://tommalu.netlify.app"
      ],
      credentials: true,
      methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling']
  });

  // Authentication middleware for Socket.io
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('_id name email role');
      
      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user._id.toString();
      socket.userRole = user.role;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`✅ User connected: ${socket.userId} (${socket.userRole})`);
    
    // Join user-specific room
    socket.join(`user:${socket.userId}`);
    
    // Join role-specific rooms
    socket.join(`role:${socket.userRole}`);
    
    // Join admin room if admin
    if (socket.userRole === 'admin') {
      socket.join('admin');
    }
    
    // Join store owner room if store owner
    if (socket.userRole === 'storeOwner') {
      socket.join('storeOwner');
    }

    // Handle disconnect
    socket.on('disconnect', () => {
      console.log(`❌ User disconnected: ${socket.userId}`);
    });

    // Handle client ping
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  return io;
};

// Get Socket.io instance
exports.getIO = () => {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
};

// Helper functions to emit notifications
exports.emitToUser = (userId, event, data) => {
  if (io) {
    io.to(`user:${userId}`).emit(event, data);
  }
};

exports.emitToStoreOwner = (storeOwnerId, event, data) => {
  if (io) {
    io.to(`user:${storeOwnerId}`).emit(event, data);
  }
};

exports.emitToAdmin = (event, data) => {
  if (io) {
    io.to('admin').emit(event, data);
  }
};

exports.emitToRole = (role, event, data) => {
  if (io) {
    io.to(`role:${role}`).emit(event, data);
  }
};

exports.emitToAll = (event, data) => {
  if (io) {
    io.emit(event, data);
  }
};

