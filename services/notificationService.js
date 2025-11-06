// notificationService.js - Service for creating and managing notifications
const Notification = require('../models/notificationSchema');
const User = require('../models/user');
const Store = require('../models/store');
const { getIO } = require('../utils/socket');
const { info } = require('../utils/logger');

/**
 * Create a notification and emit via Socket.io
 */
exports.createNotification = async ({
  userId,
  title,
  message,
  type = 'general',
  relatedId = null,
  relatedModel = null,
  metadata = {}
}) => {
  try {
    // Create notification in database
    const notification = await Notification.create({
      userId,
      title,
      message,
      type,
      relatedId,
      relatedModel,
      metadata
    });

    // Populate notification for response
    await notification.populate('userId', 'name email role');

    // Emit real-time notification via Socket.io
    try {
      const io = getIO();
      io.to(`user:${userId}`).emit('new_notification', {
        id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        relatedId: notification.relatedId,
        read: notification.read,
        createdAt: notification.createdAt
      });
    } catch (socketError) {
      // Socket.io might not be initialized, log but don't fail
      console.warn('Socket.io emit failed:', socketError.message);
    }

    info('Notification created', {
      notificationId: notification._id,
      userId,
      type
    });

    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
    throw error;
  }
};

/**
 * Notify store owner about new order
 */
exports.notifyStoreOwnerNewOrder = async (order) => {
  try {
    // Get store owner
    const store = await Store.findById(order.storeId).populate('ownerId');
    if (!store || !store.ownerId) {
      return;
    }

    const storeOwnerId = store.ownerId._id || store.ownerId;

    // Create notification
    await this.createNotification({
      userId: storeOwnerId,
      title: 'New Order Received',
      message: `You have received a new order #${order._id.toString().slice(-6)} for ₹${order.finalPrice}`,
      type: 'order_created',
      relatedId: order._id,
      relatedModel: 'Order',
      metadata: {
        orderId: order._id,
        finalPrice: order.finalPrice,
        storeId: order.storeId
      }
    });

    // Emit specific event for store owners
    try {
      const io = getIO();
      io.to(`user:${storeOwnerId}`).emit('new_order', {
        orderId: order._id,
        storeId: order.storeId,
        finalPrice: order.finalPrice,
        status: order.status,
        createdAt: order.createdAt
      });
    } catch (socketError) {
      console.warn('Socket.io emit failed for store owner:', socketError.message);
    }
  } catch (error) {
    console.error('Error notifying store owner:', error);
  }
};

/**
 * Notify customer about order status update
 */
exports.notifyCustomerOrderUpdate = async (order, status) => {
  try {
    const statusMessages = {
      'Confirmed': 'Your order has been confirmed',
      'OutForDelivery': 'Your order is out for delivery',
      'Delivered': 'Your order has been delivered',
      'Cancelled': 'Your order has been cancelled',
      'Rejected': 'Your order has been rejected'
    };

    const title = statusMessages[status] || 'Order Status Updated';
    const message = `Order #${order._id.toString().slice(-6)} status updated to ${status}`;

    await this.createNotification({
      userId: order.userId,
      title,
      message,
      type: 'order_status_updated',
      relatedId: order._id,
      relatedModel: 'Order',
      metadata: {
        orderId: order._id,
        status,
        previousStatus: order.status
      }
    });

    // Emit specific event for customer
    try {
      const io = getIO();
      io.to(`user:${order.userId}`).emit('order_status_update', {
        orderId: order._id,
        status,
        message
      });
    } catch (socketError) {
      console.warn('Socket.io emit failed for customer:', socketError.message);
    }
  } catch (error) {
    console.error('Error notifying customer:', error);
  }
};

/**
 * Notify admin about new order
 */
exports.notifyAdminNewOrder = async (order) => {
  try {
    // Get all admin users
    const admins = await User.find({ role: 'admin' }).select('_id');

    // Create notifications for all admins
    const notificationPromises = admins.map(admin =>
      this.createNotification({
        userId: admin._id,
        title: 'New Order Placed',
        message: `A new order #${order._id.toString().slice(-6)} has been placed for ₹${order.finalPrice}`,
        type: 'order_created',
        relatedId: order._id,
        relatedModel: 'Order',
        metadata: {
          orderId: order._id,
          finalPrice: order.finalPrice,
          storeId: order.storeId,
          userId: order.userId
        }
      })
    );

    await Promise.all(notificationPromises);

    // Emit to admin room
    try {
      const io = getIO();
      io.to('admin').emit('new_order', {
        orderId: order._id,
        storeId: order.storeId,
        userId: order.userId,
        finalPrice: order.finalPrice,
        status: order.status,
        createdAt: order.createdAt
      });
    } catch (socketError) {
      console.warn('Socket.io emit failed for admin:', socketError.message);
    }
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
};

/**
 * Mark notification as read
 */
exports.markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: notificationId, userId },
    { read: true, readAt: new Date() },
    { new: true }
  );
  return notification;
};

/**
 * Mark all notifications as read for a user
 */
exports.markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    { userId, read: false },
    { read: true, readAt: new Date() }
  );
  return result;
};

/**
 * Get user notifications
 */
exports.getUserNotifications = async (userId, { limit = 20, skip = 0, unreadOnly = false }) => {
  const query = { userId };
  if (unreadOnly) {
    query.read = false;
  }

  const notifications = await Notification.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip)
    .populate('relatedId')
    .lean();

  const total = await Notification.countDocuments(query);
  const unreadCount = await Notification.countDocuments({ userId, read: false });

  return {
    notifications,
    total,
    unreadCount
  };
};

/**
 * Delete notification
 */
exports.deleteNotification = async (notificationId, userId) => {
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    userId
  });
  return notification;
};

