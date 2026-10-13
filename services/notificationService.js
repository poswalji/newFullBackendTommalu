// notificationService.js - Service for creating and managing notifications
const Notification = require('../models/notificationSchema');
const User = require('../models/user');
const Store = require('../models/store');
const Order = require('../models/orderSchema');
const { writeNotification, emitToUser, getAdmin } = require('../utils/firebase');
const { info } = require('../utils/logger');
const emailService = require('../utils/emailService');

/**
 * Create a notification and emit via Firebase Realtime Database and FCM Push
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
    await notification.populate('userId', 'name email role fcmTokens');

    // Emit real-time notification via Firebase Realtime Database
    try {
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
      console.warn('Firebase emit failed:', firebaseError.message);
    }

    // ✅ FCM Push Notification
    try {
      if (notification.userId && notification.userId.fcmTokens && notification.userId.fcmTokens.length > 0) {
        const admin = getAdmin();
        const payload = {
          notification: {
            title: notification.title,
            body: notification.message,
          },
          data: {
            type: notification.type,
            relatedId: notification.relatedId ? notification.relatedId.toString() : '',
            url: `/customer/orders` // Can be dynamic based on type
          },
          tokens: notification.userId.fcmTokens
        };

        const response = await admin.messaging().sendEachForMulticast(payload);
        
        // Remove invalid tokens if any
        if (response.failureCount > 0) {
          const failedTokens = [];
          response.responses.forEach((resp, idx) => {
            if (!resp.success) {
              failedTokens.push(notification.userId.fcmTokens[idx]);
            }
          });
          
          if (failedTokens.length > 0) {
             await User.findByIdAndUpdate(userId, {
               $pullAll: { fcmTokens: failedTokens }
             });
          }
        }
      }
    } catch (fcmError) {
      console.warn('FCM Push Notification failed:', fcmError.message);
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
    const cleanStatus = (status || '').toString().toLowerCase().replace(/[\s_-]+/g, '');
    let pushTitle = 'Order Status Updated';
    let pushBody = `Order #${order._id.toString().slice(-6).toUpperCase()} status updated to ${status}`;

    if (cleanStatus === 'confirmed' || cleanStatus === 'accepted') {
      pushTitle = 'Order Confirmed! 🎉';
      pushBody = `Your order #${order._id.toString().slice(-6).toUpperCase()} is confirmed and being prepared!`;
    } else if (cleanStatus === 'preparing') {
      pushTitle = 'Food is Being Prepared! 👨‍🍳';
      pushBody = `Our chef is preparing your delicious meal.`;
    } else if (cleanStatus === 'ready') {
      pushTitle = 'Your Order is Ready! 🍽️';
      pushBody = `Your meal is ready and will be picked up soon.`;
    } else if (cleanStatus === 'outfordelivery') {
      pushTitle = 'Out for Delivery! 🛵';
      pushBody = `Your meal is on the way to your address!`;
    } else if (cleanStatus === 'delivered') {
      pushTitle = 'Order Delivered! 🎊';
      pushBody = `Your order has been delivered. Enjoy your food!`;
    } else if (cleanStatus === 'cancelled' || cleanStatus === 'rejected') {
      pushTitle = 'Order Cancelled ❌';
      pushBody = `Your order #${order._id.toString().slice(-6).toUpperCase()} has been cancelled.`;
    }

    const title = pushTitle;
    const message = pushBody;

    // Ensure userId is converted to string; if guest or missing, try finding user by phone/email
    let customerUserId = order.userId?._id?.toString() || order.userId?.toString() || order.userId;
    if (!customerUserId || customerUserId === 'undefined') {
      try {
        const phone = order.metadata?.customerPhone;
        const email = order.metadata?.customerEmail;
        if (phone || email) {
          const userDoc = await User.findOne({ $or: [{ phone: phone }, { email: email }] }).select('_id');
          if (userDoc) customerUserId = userDoc._id.toString();
        }
      } catch (findErr) {
        // Ignore
      }
    }

    if (customerUserId) {
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
    }

    // Emit specific event for customer via Firebase & FCM Push Notification
    try {
      const orderPopulated = await Order.findById(order._id)
        .populate('userId', 'name email')
        .populate('storeId', 'storeName');

      const { emitToUser, emitToAdmin, sendUserPushNotification } = require('../utils/firebase');

      if (customerUserId) {
        emitToUser(customerUserId, 'order_status_update', {
          orderId: order._id?.toString() || order._id,
          status,
          title: pushTitle,
          message: pushBody,
          customerName: orderPopulated?.userId?.name || order.metadata?.customerName || 'Customer'
        });

        // Trigger FCM Mobile / Web Push Notification to customer
        sendUserPushNotification(customerUserId, pushTitle, pushBody, {
          orderId: order._id?.toString() || order._id,
          type: 'order_status_update',
          status: status,
          url: `/customer/orders`
        }).catch(err => console.warn('Error sending FCM push to customer:', err.message));
      }

      // Also emit to admin role for order status updates
      emitToAdmin('order_status_update', {
        orderId: order._id?.toString() || order._id,
        status,
        message,
        customerName: orderPopulated?.userId?.name || order.metadata?.customerName || 'Customer',
        deliveryAddress: orderPopulated?.deliveryAddress
      });
    } catch (firebaseError) {
      console.warn('Firebase emit failed for customer:', firebaseError.message);
    }

    // Send email notification to customer for order tracking
    try {
      const customerUserId = order.userId?._id || order.userId;
      let customerEmail = order.userId?.email || order.metadata?.customerEmail;
      let customerName = order.userId?.name || order.metadata?.customerName || 'Customer';

      if (!customerEmail && customerUserId) {
        const customerDoc = await User.findById(customerUserId).select('email name');
        if (customerDoc) {
          customerEmail = customerDoc.email;
          if (customerDoc.name) customerName = customerDoc.name;
        }
      }

      if (customerEmail) {
        await emailService.sendOrderTrackingEmail(customerEmail, {
          orderId: order._id,
          status,
          orderNumber: order.orderNumber || order._id.toString().slice(-6).toUpperCase(),
          customerName,
          finalPrice: order.finalPrice,
          deliveryAddress: order.deliveryAddress
        });
        console.log(`✅ Order tracking email sent to customer (${customerEmail}) for status: ${status}`);
      }
    } catch (emailError) {
      console.error('Error sending email to customer:', emailError.message);
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
      const adminOrderPayload = {
        orderId: order._id?.toString() || order._id,
        orderNumber: order._id?.toString().slice(-6).toUpperCase(),
        storeId: order.storeId?.toString() || order.storeId,
        userId: order.userId?.toString() || order.userId,
        finalPrice: order.finalPrice,
        amount: order.finalPrice,
        customerName: order.userId?.name || 'Customer',
        status: order.status,
        createdAt: order.createdAt ? order.createdAt.toISOString() : new Date().toISOString()
      };
      emitToAdmin('new_order', adminOrderPayload);
      emitToAdmin('NEW_ORDER', adminOrderPayload);
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

/**
 * Delete all notifications for a user
 */
exports.deleteAllNotifications = async (userId) => {
  const result = await Notification.deleteMany({ userId });
  return result;
};

