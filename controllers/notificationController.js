// notificationController.js
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const notificationService = require('../services/notificationService');
const Notification = require('../models/notificationSchema');

// ✅ Get user notifications
exports.getNotifications = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { limit = 20, skip = 0, unreadOnly = false } = req.query;

  const result = await notificationService.getUserNotifications(userId, {
    limit: parseInt(limit),
    skip: parseInt(skip),
    unreadOnly: unreadOnly === 'true'
  });

  res.status(200).json({
    success: true,
    data: result.notifications,
    total: result.total,
    unreadCount: result.unreadCount
  });
});

// ✅ Mark notification as read
exports.markAsRead = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id;

  const notification = await notificationService.markAsRead(id, userId);

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Notification marked as read',
    data: notification
  });
});

// ✅ Mark all notifications as read
exports.markAllAsRead = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const result = await notificationService.markAllAsRead(userId);

  res.status(200).json({
    success: true,
    message: 'All notifications marked as read',
    data: {
      modifiedCount: result.modifiedCount
    }
  });
});

// ✅ Delete notification
exports.deleteNotification = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const userId = req.user._id;

  const notification = await notificationService.deleteNotification(id, userId);

  if (!notification) {
    return next(new AppError('Notification not found', 404));
  }

  res.status(200).json({
    success: true,
    message: 'Notification deleted',
    data: notification
  });
});

// ✅ Get unread count
exports.getUnreadCount = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;

  const unreadCount = await Notification.countDocuments({
    userId,
    read: false
  });

  res.status(200).json({
    success: true,
    data: {
      unreadCount
    }
  });
});

// ✅ Update FCM token (for push notifications)
exports.updateFCMToken = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { fcmToken } = req.body;

  if (!fcmToken) {
    return next(new AppError('FCM token is required', 400));
  }

  const User = require('../models/user');
  const user = await User.findByIdAndUpdate(
    userId,
    { fcmToken },
    { new: true }
  ).select('_id fcmToken');

  res.status(200).json({
    success: true,
    message: 'FCM token updated',
    data: user
  });
});

