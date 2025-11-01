const User = require('../models/user');
const Order = require('../models/orderSchema');
const Store = require('../models/store');
const MenuItem = require('../models/menuItems');
const Payment = require('../models/payment');
const Payout = require('../models/payout');
const Review = require('../models/review');
const Dispute = require('../models/dispute');
const Promotion = require('../models/promotion');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

// GET /api/admin/users
exports.listUsers = asyncHandler(async (req, res) => {
  const { role, status, phone, email, q, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (status) filter.status = status;
  if (phone) filter.phone = new RegExp(phone, 'i');
  if (email) filter.email = new RegExp(email, 'i');
  if (q) {
    filter.$or = [
      { name: new RegExp(q, 'i') },
      { email: new RegExp(q, 'i') },
      { phone: new RegExp(q, 'i') }
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    User.countDocuments(filter)
  ]);

  res.json({ 
    success: true, 
    data: items.map(item => ({
      id: item._id,
      name: item.name,
      email: item.email,
      role: item.role,
      phone: item.phone,
      status: item.status || 'active',
      adminRole: item.adminRole,
      createdAt: item.createdAt
    })), 
    total,
    pagination: {
      page: Number(page), 
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    } 
  });
});

// PATCH /api/admin/users/:id/suspend
exports.suspendUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'suspended' },
    { new: true }
  );
  if (!user) return next(new AppError('User not found', 404));
  res.json({ 
    success: true, 
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      status: user.status,
      adminRole: user.adminRole
    }
  });
});

// PATCH /api/admin/users/:id/reactivate
exports.reactivateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'active' },
    { new: true }
  );
  if (!user) return next(new AppError('User not found', 404));
  res.json({ 
    success: true, 
    data: {
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
      status: user.status,
      adminRole: user.adminRole
    }
  });
});

// POST /api/admin/users/:id/reset-password
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const { newPassword } = req.body;
  if (!newPassword) {
    return next(new AppError('newPassword is required', 400));
  }
  const hashed = await bcrypt.hash(newPassword, 12);
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { password: hashed },
    { new: true }
  );
  if (!user) return next(new AppError('User not found', 404));
  res.json({ success: true, message: 'Password reset successfully' });
});

// GET /api/admin/users/:id/history/orders
exports.getUserOrders = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { userId: req.params.id };
  const [items, total] = await Promise.all([
    Order.find(filter)
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Order.countDocuments(filter)
  ]);
  res.json({ 
    success: true, 
    data: items, 
    total, 
    pagination: {
      page: Number(page), 
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// GET /api/admin/users/:id/history/transactions
exports.getUserTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { userId: req.params.id };
  const [items, total] = await Promise.all([
    Payment.find(filter)
      .populate('orderId', 'status finalPrice')
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(filter)
  ]);
  res.json({ 
    success: true, 
    data: items, 
    total, 
    pagination: {
      page: Number(page), 
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// GET /api/admin/stores/pending
exports.listPendingStores = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, city, category, owner } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { status: { $in: ['submitted', 'pendingApproval'] } };
  if (category) filter.category = category;
  if (city) filter.address = new RegExp(city, 'i');
  if (owner) filter.ownerId = owner;
  const [items, total] = await Promise.all([
    Store.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)).populate('ownerId', 'name email phone'),
    Store.countDocuments(filter)
  ]);
  res.json({ 
    success: true, 
    data: items.map(store => ({
      id: store._id,
      storeName: store.storeName,
      address: store.address,
      phone: store.phone,
      licenseNumber: store.licenseNumber,
      licenseType: store.licenseType,
      category: store.category,
      description: store.description,
      status: store.status,
      isVerified: store.isVerified,
      rejectionReason: store.rejectionReason,
      ownerId: store.ownerId,
      createdAt: store.createdAt
    })), 
    total, 
    pagination: {
      page: Number(page), 
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// POST /api/admin/stores/:id/approve
exports.approveStore = asyncHandler(async (req, res, next) => {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'active', isVerified: true, available: true, rejectionReason: undefined },
    { new: true }
  ).populate('ownerId', 'name email phone');
  if (!store) return next(new AppError('Store not found', 404));
  // TODO: notify store owner via email/SMS
  res.json({ 
    success: true, 
    data: {
      id: store._id,
      storeName: store.storeName,
      address: store.address,
      phone: store.phone,
      category: store.category,
      status: store.status,
      isVerified: store.isVerified,
      ownerId: store.ownerId
    }
  });
});

// POST /api/admin/stores/:id/reject
exports.rejectStore = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'rejected', isVerified: false, available: false, rejectionReason: reason || 'Not specified' },
    { new: true }
  ).populate('ownerId', 'name email phone');
  if (!store) return next(new AppError('Store not found', 404));
  // TODO: notify store owner via email/SMS
  res.json({ 
    success: true, 
    data: {
      id: store._id,
      storeName: store.storeName,
      address: store.address,
      phone: store.phone,
      category: store.category,
      status: store.status,
      isVerified: store.isVerified,
      rejectionReason: store.rejectionReason,
      ownerId: store.ownerId
    }
  });
});

// PATCH /api/admin/stores/:id/suspend
exports.suspendStore = asyncHandler(async (req, res, next) => {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'suspended', available: false },
    { new: true }
  ).populate('ownerId', 'name email phone');
  if (!store) return next(new AppError('Store not found', 404));
  res.json({ 
    success: true, 
    data: {
      id: store._id,
      storeName: store.storeName,
      address: store.address,
      phone: store.phone,
      category: store.category,
      status: store.status,
      available: store.available,
      ownerId: store.ownerId
    }
  });
});

// PATCH /api/admin/stores/:id/metadata
exports.updateStoreMetadata = asyncHandler(async (req, res, next) => {
  const allowed = ['category', 'description', 'openingTime', 'closingTime', 'deliveryFee', 'minOrder'];
  const updates = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });
  const store = await Store.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true })
    .populate('ownerId', 'name email phone');
  if (!store) return next(new AppError('Store not found', 404));
  res.json({ 
    success: true, 
    data: {
      id: store._id,
      storeName: store.storeName,
      address: store.address,
      phone: store.phone,
      category: store.category,
      description: store.description,
      openingTime: store.openingTime,
      closingTime: store.closingTime,
      deliveryFee: store.deliveryFee,
      minOrder: store.minOrder,
      status: store.status,
      ownerId: store.ownerId
    }
  });
});

// PATCH /api/admin/stores/:id/commission
exports.updateStoreCommission = asyncHandler(async (req, res, next) => {
  const { commissionRate } = req.body;
  if (commissionRate === undefined) return next(new AppError('commissionRate is required', 400));
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { commissionRate },
    { new: true, runValidators: true }
  ).populate('ownerId', 'name email phone');
  if (!store) return next(new AppError('Store not found', 404));
  res.json({ 
    success: true, 
    data: {
      id: store._id,
      storeName: store.storeName,
      address: store.address,
      phone: store.phone,
      category: store.category,
      commissionRate: store.commissionRate,
      status: store.status,
      ownerId: store.ownerId
    }
  });
});

// =============================================
// ANALYTICS & REPORTS
// =============================================

// GET /api/admin/analytics/dashboard
exports.getDashboardAnalytics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const filter = {};
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  
  const [
    totalOrders,
    completedOrders,
    totalRevenue,
    totalCommission,
    activeStores,
    totalCustomers,
    totalStoreOwners,
    recentOrders
  ] = await Promise.all([
    Order.countDocuments(filter),
    Order.countDocuments({ ...filter, status: 'Delivered' }),
    Payment.aggregate([
      { $match: { ...filter, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]),
    Payment.aggregate([
      { $match: { ...filter, status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$commissionAmount' } } }
    ]),
    Store.countDocuments({ status: 'active', available: true }),
    User.countDocuments({ role: 'customer', status: 'active' }),
    User.countDocuments({ role: 'storeOwner', status: 'active' }),
    Order.find(filter).sort({ createdAt: -1 }).limit(10)
      .populate('userId', 'name email')
      .populate('storeId', 'storeName')
  ]);
  
  // Calculate average order value
  const avgOrderValue = completedOrders > 0 
    ? (totalRevenue[0]?.total || 0) / completedOrders 
    : 0;
  
  res.json({
    success: true,
    data: {
      orders: {
        total: totalOrders,
        completed: completedOrders,
        pending: totalOrders - completedOrders,
        averageOrderValue: Math.round(avgOrderValue * 100) / 100
      },
      revenue: {
        total: totalRevenue[0]?.total || 0,
        commission: totalCommission[0]?.total || 0,
        netRevenue: (totalRevenue[0]?.total || 0) - (totalCommission[0]?.total || 0)
      },
      users: {
        customers: totalCustomers,
        storeOwners: totalStoreOwners,
        total: totalCustomers + totalStoreOwners
      },
      stores: {
        active: activeStores
      },
      recentOrders: recentOrders.map(order => ({
        id: order._id,
        customer: order.userId?.name,
        store: order.storeId?.storeName,
        amount: order.finalPrice,
        status: order.status,
        createdAt: order.createdAt
      }))
    }
  });
});

// GET /api/admin/analytics/orders
exports.getOrderAnalytics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate, groupBy = 'day' } = req.query;
  const matchFilter = {};
  
  if (startDate || endDate) {
    matchFilter.createdAt = {};
    if (startDate) matchFilter.createdAt.$gte = new Date(startDate);
    if (endDate) matchFilter.createdAt.$lte = new Date(endDate);
  }
  
  let groupFormat = {};
  if (groupBy === 'day') {
    groupFormat = { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } };
  } else if (groupBy === 'week') {
    groupFormat = { $dateToString: { format: '%Y-W%V', date: '$createdAt' } };
  } else if (groupBy === 'month') {
    groupFormat = { $dateToString: { format: '%Y-%m', date: '$createdAt' } };
  }
  
  const analytics = await Order.aggregate([
    { $match: matchFilter },
    {
      $group: {
        _id: groupFormat,
        totalOrders: { $sum: 1 },
        completedOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'Delivered'] }, 1, 0] }
        },
        totalRevenue: { $sum: '$finalPrice' },
        cancelledOrders: {
          $sum: { $cond: [{ $eq: ['$status', 'Cancelled'] }, 1, 0] }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  res.json({
    success: true,
    data: analytics
  });
});

// GET /api/admin/analytics/stores
exports.getStoreAnalytics = asyncHandler(async (req, res, next) => {
  const { category, city, top = 10 } = req.query;
  
  const storeFilter = { status: 'active' };
  if (category) storeFilter.category = category;
  if (city) storeFilter.address = new RegExp(city, 'i');
  
  // Top performing stores
  const topStores = await Store.aggregate([
    { $match: storeFilter },
    {
      $lookup: {
        from: 'orders',
        localField: '_id',
        foreignField: 'storeId',
        as: 'orders'
      }
    },
    {
      $lookup: {
        from: 'payments',
        localField: '_id',
        foreignField: 'storeId',
        as: 'payments'
      }
    },
    {
      $project: {
        storeName: 1,
        category: 1,
        rating: 1,
        totalReviews: 1,
        orderCount: { $size: '$orders' },
        totalRevenue: {
          $sum: '$payments.amount'
        },
        totalEarnings: {
          $sum: '$payments.storePayoutAmount'
        }
      }
    },
    { $sort: { totalRevenue: -1 } },
    { $limit: Number(top) }
  ]);
  
  // Category distribution
  const categoryDistribution = await Store.aggregate([
    { $match: { status: 'active' } },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
        avgRating: { $avg: '$rating' }
      }
    }
  ]);
  
  res.json({
    success: true,
    data: {
      topStores,
      categoryDistribution
    }
  });
});

// GET /api/admin/analytics/revenue
exports.getRevenueAnalytics = asyncHandler(async (req, res, next) => {
  const { startDate, endDate } = req.query;
  const filter = { status: 'completed' };
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  
  const revenueData = await Payment.aggregate([
    { $match: filter },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        totalCommission: { $sum: '$commissionAmount' },
        totalPayout: { $sum: '$storePayoutAmount' },
        orderCount: { $sum: 1 }
      }
    }
  ]);
  
  res.json({
    success: true,
    data: revenueData[0] || {
      totalRevenue: 0,
      totalCommission: 0,
      totalPayout: 0,
      orderCount: 0
    }
  });
});

// GET /api/admin/reports/export
exports.exportReport = asyncHandler(async (req, res, next) => {
  const { type, startDate, endDate, format = 'json' } = req.query;
  
  const filter = {};
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  
  let data = {};
  
  switch (type) {
    case 'orders':
      data.orders = await Order.find(filter)
        .populate('userId', 'name email')
        .populate('storeId', 'storeName')
        .sort({ createdAt: -1 });
      break;
    case 'payments':
      data.payments = await Payment.find(filter)
        .populate('orderId', 'status')
        .populate('userId', 'name email')
        .populate('storeId', 'storeName')
        .sort({ createdAt: -1 });
      break;
    case 'stores':
      data.stores = await Store.find(filter)
        .populate('ownerId', 'name email')
        .sort({ createdAt: -1 });
      break;
    case 'users':
      data.users = await User.find(filter).sort({ createdAt: -1 });
      break;
    default:
      return next(new AppError('Invalid report type', 400));
  }
  
  if (format === 'json') {
    res.json({ success: true, data });
  } else {
    // TODO: Implement CSV/Excel export
    res.json({ success: true, message: 'Export format not yet implemented', data });
  }
});

// =============================================
// MENU OVERSIGHT
// =============================================

// GET /api/admin/menu/items
exports.listMenuItems = asyncHandler(async (req, res, next) => {
  const { storeId, category, isAvailable, page = 1, limit = 20 } = req.query;
  const filter = {};
  
  if (storeId) filter.storeId = storeId;
  if (category) filter.category = category;
  if (isAvailable !== undefined) filter.isAvailable = isAvailable === 'true';
  
  const skip = (Number(page) - 1) * Number(limit);
  const [items, total] = await Promise.all([
    MenuItem.find(filter)
      .populate('storeId', 'storeName category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    MenuItem.countDocuments(filter)
  ]);
  
  res.json({
    success: true,
    data: items,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// PATCH /api/admin/menu/items/:id/disable
exports.disableMenuItem = asyncHandler(async (req, res, next) => {
  const menuItem = await MenuItem.findByIdAndUpdate(
    req.params.id,
    { isAvailable: false },
    { new: true }
  ).populate('storeId', 'storeName');
  
  if (!menuItem) {
    return next(new AppError('Menu item not found', 404));
  }
  
  res.json({
    success: true,
    message: 'Menu item disabled',
    data: menuItem
  });
});

// GET /api/admin/menu/items/:id
exports.getMenuItemById = asyncHandler(async (req, res, next) => {
  const menuItem = await MenuItem.findById(req.params.id)
    .populate('storeId', 'storeName category address');
  
  if (!menuItem) {
    return next(new AppError('Menu item not found', 404));
  }
  
  res.json({
    success: true,
    data: menuItem
  });
});

// =============================================
// DISPUTE RESOLUTION
// =============================================

// GET /api/admin/disputes
exports.listDisputes = asyncHandler(async (req, res, next) => {
  const { status, priority, type, page = 1, limit = 20 } = req.query;
  const filter = {};
  
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (type) filter.type = type;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [disputes, total] = await Promise.all([
    Dispute.find(filter)
      .populate('userId', 'name email phone')
      .populate('storeId', 'storeName')
      .populate('orderId', 'status finalPrice')
      .populate('resolution.resolvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Dispute.countDocuments(filter)
  ]);
  
  res.json({
    success: true,
    data: disputes,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// GET /api/admin/disputes/:id
exports.getDisputeById = asyncHandler(async (req, res, next) => {
  const dispute = await Dispute.findById(req.params.id)
    .populate('userId', 'name email phone')
    .populate('storeId', 'storeName ownerId')
    .populate('orderId')
    .populate('timeline.performedBy', 'name email')
    .populate('resolution.resolvedBy', 'name email');
  
  if (!dispute) {
    return next(new AppError('Dispute not found', 404));
  }
  
  res.json({
    success: true,
    data: dispute
  });
});

// POST /api/admin/disputes/:id/resolve
exports.resolveDispute = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { action, amount, notes } = req.body;
  
  const dispute = await Dispute.findById(id);
  if (!dispute) {
    return next(new AppError('Dispute not found', 404));
  }
  
  const validActions = ['refund_full', 'refund_partial', 'store_action', 'no_action', 'other'];
  if (!validActions.includes(action)) {
    return next(new AppError('Invalid resolution action', 400));
  }
  
  await dispute.resolve(req.user._id, { action, amount, notes });
  
  // If refund action, process refund
  if (action === 'refund_full' || action === 'refund_partial') {
    const payment = await Payment.findOne({ orderId: dispute.orderId });
    if (payment) {
      await payment.processRefund(notes || 'Dispute resolution');
    }
  }
  
  res.json({
    success: true,
    message: 'Dispute resolved successfully',
    data: dispute
  });
});

// POST /api/admin/disputes/:id/escalate
exports.escalateDispute = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { notes } = req.body;
  
  const dispute = await Dispute.findById(id);
  if (!dispute) {
    return next(new AppError('Dispute not found', 404));
  }
  
  await dispute.escalate(req.user._id, notes);
  
  res.json({
    success: true,
    message: 'Dispute escalated',
    data: dispute
  });
});

// POST /api/admin/disputes/:id/close
exports.closeDispute = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { notes } = req.body;
  
  const dispute = await Dispute.findById(id);
  if (!dispute) {
    return next(new AppError('Dispute not found', 404));
  }
  
  await dispute.close(req.user._id, notes);
  
  res.json({
    success: true,
    message: 'Dispute closed',
    data: dispute
  });
});

// =============================================
// PAYOUT MANAGEMENT
// =============================================

// GET /api/admin/payouts
exports.listPayouts = asyncHandler(async (req, res, next) => {
  const { status, storeId, ownerId, page = 1, limit = 20 } = req.query;
  const filter = {};
  
  if (status) filter.status = status;
  if (storeId) filter.storeId = storeId;
  if (ownerId) filter.ownerId = ownerId;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [payouts, total] = await Promise.all([
    Payout.find(filter)
      .populate('storeId', 'storeName')
      .populate('ownerId', 'name email phone')
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payout.countDocuments(filter)
  ]);
  
  res.json({
    success: true,
    data: payouts,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// POST /api/admin/payouts/:id/approve
exports.approvePayout = asyncHandler(async (req, res, next) => {
  const payout = await Payout.findById(req.params.id);
  if (!payout) {
    return next(new AppError('Payout not found', 404));
  }
  
  await payout.approve(req.user._id);
  
  res.json({
    success: true,
    message: 'Payout approved',
    data: payout
  });
});

// POST /api/admin/payouts/:id/complete
exports.completePayout = asyncHandler(async (req, res, next) => {
  const { transferId, transferResponse } = req.body;
  
  const payout = await Payout.findById(req.params.id);
  if (!payout) {
    return next(new AppError('Payout not found', 404));
  }
  
  if (payout.status !== 'approved') {
    return next(new AppError('Payout must be approved before completion', 400));
  }
  
  await payout.complete(transferId, transferResponse);
  
  // Update payment payout statuses
  await Payment.updateMany(
    { _id: { $in: payout.paymentIds } },
    { payoutStatus: 'completed', payoutDate: new Date() }
  );
  
  res.json({
    success: true,
    message: 'Payout completed',
    data: payout
  });
});

// POST /api/admin/payouts/generate
exports.generatePayout = asyncHandler(async (req, res, next) => {
  const { storeId, periodStart, periodEnd } = req.body;
  
  // Get eligible payments
  const eligiblePayments = await Payment.find({
    storeId,
    status: 'completed',
    payoutStatus: 'eligible',
    createdAt: {
      $gte: new Date(periodStart),
      $lte: new Date(periodEnd)
    }
  });
  
  if (eligiblePayments.length === 0) {
    return next(new AppError('No eligible payments found for this period', 400));
  }
  
  // Get store and owner
  const store = await Store.findById(storeId);
  if (!store) {
    return next(new AppError('Store not found', 404));
  }
  
  // Create payout
  const payout = await Payout.create({
    storeId,
    ownerId: store.ownerId,
    periodStart: new Date(periodStart),
    periodEnd: new Date(periodEnd),
    status: 'pending'
  });
  
  payout.calculateTotals(eligiblePayments);
  await payout.save();
  
  res.status(201).json({
    success: true,
    message: 'Payout generated successfully',
    data: payout
  });
});

// GET /api/admin/payouts/:id
exports.getPayoutById = asyncHandler(async (req, res, next) => {
  const payout = await Payout.findById(req.params.id)
    .populate('storeId', 'storeName')
    .populate('ownerId', 'name email phone')
    .populate('processedBy', 'name email')
    .populate('paymentIds');
  
  if (!payout) {
    return next(new AppError('Payout not found', 404));
  }
  
  res.json({
    success: true,
    data: payout
  });
});

// =============================================
// ORDER OVERRIDE (Admin can cancel/override orders)
// =============================================

// POST /api/admin/orders/:id/cancel
exports.cancelOrderAdmin = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  const order = await Order.findByIdAndUpdate(
    id,
    {
      status: 'Cancelled',
      cancellationReason: reason || 'Cancelled by admin'
    },
    { new: true }
  ).populate('userId', 'name email').populate('storeId', 'storeName');
  
  if (!order) {
    return next(new AppError('Order not found', 404));
  }
  
  // Process refund if payment exists
  const payment = await Payment.findOne({ orderId: id });
  if (payment && payment.status === 'completed') {
    await payment.processRefund(reason || 'Order cancelled by admin');
  }
  
  res.json({
    success: true,
    message: 'Order cancelled by admin',
    data: order
  });
});

// GET /api/admin/stores (all stores with filters)
exports.listAllStores = asyncHandler(async (req, res, next) => {
  const { status, category, city, page = 1, limit = 20 } = req.query;
  const filter = {};
  
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (city) filter.address = new RegExp(city, 'i');
  
  const skip = (Number(page) - 1) * Number(limit);
  const [stores, total] = await Promise.all([
    Store.find(filter)
      .populate('ownerId', 'name email phone')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Store.countDocuments(filter)
  ]);
  
  res.json({
    success: true,
    data: stores,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});


