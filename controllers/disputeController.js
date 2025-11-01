const Dispute = require('../models/dispute');
const Order = require('../models/orderSchema');
const Payment = require('../models/payment');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ Customer: Create dispute
exports.createDispute = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { orderId, type, title, description, attachments } = req.body;
  
  if (req.user.role !== 'customer') {
    return next(new AppError('Only customers can create disputes', 403));
  }
  
  // Verify order belongs to user
  const order = await Order.findById(orderId)
    .populate('storeId')
    .populate('userId');
  
  if (!order) {
    return next(new AppError('Order not found', 404));
  }
  
  if (order.userId._id.toString() !== userId.toString()) {
    return next(new AppError('Order does not belong to you', 403));
  }
  
  // Check if dispute already exists
  const existingDispute = await Dispute.findOne({ orderId });
  if (existingDispute) {
    return next(new AppError('Dispute already exists for this order', 400));
  }
  
  // Create dispute
  const dispute = await Dispute.create({
    orderId,
    userId,
    storeId: order.storeId._id || order.storeId,
    type,
    title,
    description,
    attachments: attachments || [],
    priority: 'medium'
  });
  
  // Add initial timeline entry
  await dispute.addTimelineEntry(
    'Dispute created',
    userId,
    'Customer created dispute'
  );
  
  // TODO: Notify admin and store owner
  
  res.status(201).json({
    success: true,
    message: 'Dispute created successfully',
    data: dispute
  });
});

// ✅ Get user disputes
exports.getMyDisputes = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { status, type, page = 1, limit = 20 } = req.query;
  
  const filter = { userId };
  if (status) filter.status = status;
  if (type) filter.type = type;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [disputes, total] = await Promise.all([
    Dispute.find(filter)
      .populate('storeId', 'storeName')
      .populate('orderId', 'status finalPrice')
      .populate('resolution.resolvedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Dispute.countDocuments(filter)
  ]);
  
  res.status(200).json({
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

// ✅ Get dispute by ID
exports.getDisputeById = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const dispute = await Dispute.findById(req.params.id)
    .populate('userId', 'name email phone')
    .populate('storeId', 'storeName')
    .populate('orderId')
    .populate('timeline.performedBy', 'name')
    .populate('resolution.resolvedBy', 'name email');
  
  if (!dispute) {
    return next(new AppError('Dispute not found', 404));
  }
  
  // Verify access (customer or admin)
  if (req.user.role !== 'admin' && dispute.userId._id.toString() !== userId.toString()) {
    return next(new AppError('Not authorized to view this dispute', 403));
  }
  
  res.status(200).json({
    success: true,
    data: dispute
  });
});

// ✅ Store Owner: Get disputes for their stores
exports.getStoreDisputes = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  
  if (req.user.role !== 'storeOwner') {
    return next(new AppError('Only store owners can view store disputes', 403));
  }
  
  // Get all stores owned by user
  const Store = require('../models/store');
  const stores = await Store.find({ ownerId });
  const storeIds = stores.map(s => s._id);
  
  const { status, type, page = 1, limit = 20 } = req.query;
  const filter = { storeId: { $in: storeIds } };
  
  if (status) filter.status = status;
  if (type) filter.type = type;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [disputes, total] = await Promise.all([
    Dispute.find(filter)
      .populate('userId', 'name email phone')
      .populate('storeId', 'storeName')
      .populate('orderId', 'status finalPrice')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Dispute.countDocuments(filter)
  ]);
  
  res.status(200).json({
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

