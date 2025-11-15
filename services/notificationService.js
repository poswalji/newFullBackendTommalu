// notificationService.js - Service for creating and managing notifications
const Notification = require('../models/notificationSchema');
const User = require('../models/user');
const Store = require('../models/store');
const Order = require('../models/orderSchema');
const { writeNotification, emitToUser } = require('../utils/firebase');
const { info } = require('../utils/logger');
const emailService = require('../utils/emailService');

/**
 * Create a notification and emit via Firebase Realtime Database
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

    // Emit real-time notification via Firebase Realtime Database
    try {
      // ✅ FIXED: Ensure userId is converted to string
      const userRoomId = userId?._id?.toString() || userId?.toString() || userId;
      writeNotification(userRoomId, {
        id: notification._id.toString(),
        title: notification.title,
        message: notification.message,
        type: notification.type,
        relatedId: notification.relatedId ? notification.relatedId.toString() : null,
        read: notification.read,
        createdAt: notification.createdAt.toISOString()
      });
    } catch (firebaseError) {
      // Firebase might not be initialized, log but don't fail
      console.warn('Firebase emit failed:', firebaseError.message);
    }

    info('Notification created', {
      notificationId: notification._id,
      userId,
      type
    });

    // Send email notification for order-related notifications (tracking)
    if (type === 'order_created' || type === 'order_status_updated') {
      try {
        const user = await User.findById(userId).select('email name role');
        if (user && user.email) {
          // Get order details for email
          if (relatedId && relatedModel === 'Order') {
            const order = await Order.findById(relatedId)
              .populate('userId', 'name email phone')
              .populate('storeId', 'storeName');
            
            if (order) {
              const orderNumber = order._id.toString().slice(-6);
              const customerName = order.userId?.name || order.userId?.name || 'Customer';
              
              if (type === 'order_created') {
                // Send new order email to customer
                if (user.role === 'customer') {
                  emailService.sendOrderTrackingEmail(user.email, {
                    orderId: order._id,
                    status: order.status || 'Pending',
                    orderNumber,
                    customerName,
                    finalPrice: order.finalPrice,
                    deliveryAddress: order.deliveryAddress
                  }).catch(err => {
                    console.error('Error sending order tracking email:', err);
                  });
                }
              } else if (type === 'order_status_updated') {
                // Send order status update email to customer
                if (user.role === 'customer') {
                  emailService.sendOrderTrackingEmail(user.email, {
                    orderId: order._id,
                    status: metadata?.status || order.status,
                    orderNumber,
                    customerName,
                    finalPrice: order.finalPrice,
                    deliveryAddress: order.deliveryAddress
                  }).catch(err => {
                    console.error('Error sending order tracking email:', err);
                  });
                }
              }
            }
          }
        }
      } catch (emailError) {
        // Don't fail notification creation if email fails
        console.error('Error sending email notification:', emailError);
      }
    }

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
    // ✅ FIXED: Ensure storeOwnerId is converted to string
    const storeOwnerIdString = storeOwnerId?._id?.toString() || storeOwnerId?.toString() || storeOwnerId;

    // Create notification
    await this.createNotification({
      userId: storeOwnerIdString,
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

    // Send email notification to store owner
    try {
      const storeOwner = await User.findById(storeOwnerIdString).select('email name');
      if (storeOwner && storeOwner.email) {
        const orderPopulated = await Order.findById(order._id)
          .populate('userId', 'name email');
        
        emailService.sendNewOrderEmailToStoreOwner(storeOwner.email, {
          orderId: order._id,
          orderNumber: order._id.toString().slice(-6),
          customerName: orderPopulated?.userId?.name || 'Customer',
          finalPrice: order.finalPrice,
          items: order.items
        }).catch(err => {
          console.error('Error sending new order email to store owner:', err);
        });
      }
    } catch (emailError) {
      console.error('Error sending email to store owner:', emailError);
    }

    // Emit specific event for store owners via Firebase
    try {
      emitToUser(storeOwnerIdString, 'new_order', {
        orderId: order._id?.toString() || order._id,
        storeId: order.storeId?.toString() || order.storeId,
        finalPrice: order.finalPrice,
        status: order.status,
        createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString()
      });
    } catch (firebaseError) {
      console.warn('Firebase emit failed for store owner:', firebaseError.message);
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

    // ✅ FIXED: Ensure userId is converted to string
    const customerUserId = order.userId?._id?.toString() || order.userId?.toString() || order.userId;

    await this.createNotification({
      userId: customerUserId,
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

    // Emit specific event for customer via Firebase
    try {
      const orderPopulated = await Order.findById(order._id)
        .populate('userId', 'name email')
        .populate('storeId', 'storeName');
      
      // ✅ FIXED: Reuse customerUserId (already defined above)
      emitToUser(customerUserId, 'order_status_update', {
        orderId: order._id?.toString() || order._id,
        status,
        message,
        customerName: orderPopulated?.userId?.name || order.userId?.name || 'Customer'
      });

      // Also emit to admin role for order status updates
      const { emitToAdmin } = require('../utils/firebase');
      emitToAdmin('order_status_update', {
        orderId: order._id?.toString() || order._id,
        status,
        message,
        customerName: orderPopulated?.userId?.name || 'Customer',
        deliveryAddress: orderPopulated?.deliveryAddress
      });
    } catch (firebaseError) {
      console.warn('Firebase emit failed for customer:', firebaseError.message);
    }

    // Send email notification to customer for order tracking
    try {
      const customer = await User.findById(order.userId).select('email name');
      if (customer && customer.email) {
        const orderPopulated = await Order.findById(order._id)
          .populate('userId', 'name email')
          .populate('storeId', 'storeName');
        
        emailService.sendOrderTrackingEmail(customer.email, {
          orderId: order._id,
          status,
          orderNumber: order._id.toString().slice(-6),
          customerName: orderPopulated?.userId?.name || customer.name || 'Customer',
          finalPrice: order.finalPrice,
          deliveryAddress: order.deliveryAddress
        }).catch(err => {
          console.error('Error sending order tracking email to customer:', err);
        });
      }
    } catch (emailError) {
      console.error('Error sending email to customer:', emailError);
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
    const admins = await User.find({ role: 'admin' }).select('_id email name');

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

    // Emit to admin role via Firebase
    try {
      const { emitToAdmin } = require('../utils/firebase');
      emitToAdmin('new_order', {
        orderId: order._id?.toString() || order._id,
        storeId: order.storeId?.toString() || order.storeId,
        userId: order.userId?.toString() || order.userId,
        finalPrice: order.finalPrice,
        status: order.status,
        createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString()
      });
    } catch (firebaseError) {
      console.warn('Firebase emit failed for admin:', firebaseError.message);
    }
  } catch (error) {
    console.error('Error notifying admin:', error);
  }
};

/**
 * Notify admin about delivery assignment (admin as delivery boy)
 */
exports.notifyAdminDeliveryAssignment = async (order) => {
  try {
    // Get all admin users
    const admins = await User.find({ role: 'admin' }).select('_id email name');

    // Populate order with customer and store details
    const orderPopulated = await Order.findById(order._id || order)
      .populate('userId', 'name email phone')
      .populate('storeId', 'storeName');

    if (!orderPopulated) {
      console.error('Order not found for delivery assignment notification');
      return;
    }

    const orderNumber = orderPopulated._id.toString().slice(-6);
    const customerName = orderPopulated.userId?.name || 'Customer';
    const customerPhone = orderPopulated.userId?.phone || null;

    // Create notifications for all admins
    const notificationPromises = admins.map(admin =>
      this.createNotification({
        userId: admin._id,
        title: '🚚 New Delivery Assignment',
        message: `Order #${orderNumber} is ready for delivery. Customer: ${customerName}`,
        type: 'delivery_assigned',
        relatedId: orderPopulated._id,
        relatedModel: 'Order',
        metadata: {
          orderId: orderPopulated._id,
          customerName,
          customerPhone,
          deliveryAddress: orderPopulated.deliveryAddress,
          finalPrice: orderPopulated.finalPrice
        }
      })
    );

    await Promise.all(notificationPromises);

    // Emit delivery_assigned event to all admins via Firebase
    try {
      const { emitToUser } = require('../utils/firebase');
      admins.forEach(adminUser => {
        // ✅ FIXED: Ensure admin._id is converted to string
        const adminIdString = adminUser._id?.toString() || adminUser._id;
        emitToUser(adminIdString, 'delivery_assigned', {
          orderId: orderPopulated._id?.toString() || orderPopulated._id,
          orderNumber,
          customerName,
          customerPhone,
          deliveryAddress: orderPopulated.deliveryAddress,
          finalPrice: orderPopulated.finalPrice,
          storeName: orderPopulated.storeId?.storeName || 'Store'
        });
      });
    } catch (firebaseError) {
      console.warn('Firebase emit failed for delivery assignment:', firebaseError.message);
    }

    // Send email notifications to all admins
    const emailPromises = admins.map(admin => {
      if (admin.email) {
        return emailService.sendDeliveryAssignmentEmail(admin.email, {
          orderId: orderPopulated._id,
          orderNumber,
          customerName,
          customerPhone,
          finalPrice: orderPopulated.finalPrice,
          deliveryAddress: orderPopulated.deliveryAddress
        }).catch(err => {
          console.error(`Error sending delivery assignment email to admin ${admin._id}:`, err);
        });
      }
      return Promise.resolve();
    });

    await Promise.all(emailPromises);
  } catch (error) {
    console.error('Error notifying admin about delivery assignment:', error);
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

