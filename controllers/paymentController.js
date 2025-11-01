const Payment = require('../models/payment');
const Order = require('../models/orderSchema');
const Store = require('../models/store');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ Create payment record for order
exports.createPayment = asyncHandler(async (req, res, next) => {
  const { orderId, paymentMethod = 'cash_on_delivery', paymentGateway = null } = req.body;
  
  const order = await Order.findById(orderId)
    .populate('storeId')
    .populate('userId');
  
  if (!order) {
    return next(new AppError('Order not found', 404));
  }
  
  // Check if payment already exists
  const existingPayment = await Payment.findOne({ orderId });
  if (existingPayment) {
    return next(new AppError('Payment already exists for this order', 400));
  }
  
  // Get commission rate from store
  const commissionRate = order.storeId.commissionRate || 10;
  
  // Create payment
  const payment = await Payment.create({
    orderId,
    userId: order.userId._id || order.userId,
    storeId: order.storeId._id || order.storeId,
    amount: order.finalPrice,
    commissionRate,
    paymentMethod,
    paymentGateway,
    status: paymentMethod === 'cash_on_delivery' ? 'pending' : 'processing'
  });
  
  // Calculate commission and payout
  payment.calculateCommission(commissionRate);
  await payment.save();
  
  res.status(201).json({
    success: true,
    message: 'Payment record created successfully',
    data: {
      id: payment._id,
      orderId: payment.orderId,
      userId: payment.userId,
      storeId: payment.storeId,
      amount: payment.amount,
      commissionAmount: payment.commissionAmount,
      storePayoutAmount: payment.storePayoutAmount,
      commissionRate: payment.commissionRate,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      payoutStatus: payment.payoutStatus,
      createdAt: payment.createdAt
    }
  });
});

// ✅ Update payment status (after online payment)
exports.updatePaymentStatus = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.params;
  const { status, transactionId, gatewayOrderId, gatewayResponse } = req.body;
  
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    return next(new AppError('Payment not found', 404));
  }
  
  // Update payment status
  payment.status = status;
  if (transactionId) payment.transactionId = transactionId;
  if (gatewayOrderId) payment.gatewayOrderId = gatewayOrderId;
  if (gatewayResponse) payment.gatewayResponse = gatewayResponse;
  
  // If payment completed, mark as eligible for payout
  if (status === 'completed') {
    await payment.markEligibleForPayout();
  } else {
    await payment.save();
  }
  
  // Update order status if payment completed
  if (status === 'completed') {
    await Order.findByIdAndUpdate(payment.orderId, {
      status: 'Confirmed'
    });
  }
  
  res.status(200).json({
    success: true,
    message: 'Payment status updated',
    data: payment
  });
});

// ✅ Process refund
exports.processRefund = asyncHandler(async (req, res, next) => {
  const { paymentId } = req.params;
  const { reason, refundTransactionId } = req.body;
  
  const payment = await Payment.findById(paymentId);
  if (!payment) {
    return next(new AppError('Payment not found', 404));
  }
  
  if (payment.status !== 'completed') {
    return next(new AppError('Payment must be completed to process refund', 400));
  }
  
  // Process refund
  await payment.processRefund(reason);
  
  if (refundTransactionId) {
    payment.refundTransactionId = refundTransactionId;
    payment.refundStatus = 'completed';
    await payment.save();
  }
  
  // Update order status
  await Order.findByIdAndUpdate(payment.orderId, {
    status: 'Cancelled'
  });
  
  res.status(200).json({
    success: true,
    message: 'Refund processed successfully',
    data: payment
  });
});

// ✅ Get payments for user
exports.getUserPayments = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { status, page = 1, limit = 20 } = req.query;
  
  const filter = { userId };
  if (status) filter.status = status;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('orderId', 'status finalPrice')
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(filter)
  ]);
  
  res.status(200).json({
    success: true,
    data: payments,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Get payments for store owner
exports.getStorePayments = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const { status, payoutStatus, page = 1, limit = 20 } = req.query;
  
  // Get all stores owned by this user
  const stores = await Store.find({ ownerId });
  const storeIds = stores.map(s => s._id);
  
  const filter = { storeId: { $in: storeIds } };
  if (status) filter.status = status;
  if (payoutStatus) filter.payoutStatus = payoutStatus;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('orderId', 'status finalPrice')
      .populate('userId', 'name email')
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(filter)
  ]);
  
  // Calculate totals
  const totalAmount = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalCommission = payments.reduce((sum, p) => sum + p.commissionAmount, 0);
  const totalPayout = payments.reduce((sum, p) => sum + p.storePayoutAmount, 0);
  
  res.status(200).json({
    success: true,
    data: payments,
    totals: {
      totalAmount,
      totalCommission,
      totalPayout
    },
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Get eligible payouts for store
exports.getEligiblePayouts = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const storeId = req.params.storeId;
  
  // Verify store ownership
  const store = await Store.findOne({ _id: storeId, ownerId });
  if (!store) {
    return next(new AppError('Store not found or unauthorized', 404));
  }
  
  const eligiblePayments = await Payment.find({
    storeId,
    status: 'completed',
    payoutStatus: 'eligible'
  })
    .populate('orderId', 'status')
    .sort({ createdAt: -1 });
  
  const totalAmount = eligiblePayments.reduce((sum, p) => sum + p.amount, 0);
  const totalCommission = eligiblePayments.reduce((sum, p) => sum + p.commissionAmount, 0);
  const totalPayout = eligiblePayments.reduce((sum, p) => sum + p.storePayoutAmount, 0);
  
  res.status(200).json({
    success: true,
    data: {
      payments: eligiblePayments,
      summary: {
        totalAmount,
        totalCommission,
        totalPayout,
        orderCount: eligiblePayments.length
      }
    }
  });
});

// ✅ Admin: Get all payments
exports.getAllPayments = asyncHandler(async (req, res, next) => {
  const { status, payoutStatus, storeId, userId, page = 1, limit = 20 } = req.query;
  
  const filter = {};
  if (status) filter.status = status;
  if (payoutStatus) filter.payoutStatus = payoutStatus;
  if (storeId) filter.storeId = storeId;
  if (userId) filter.userId = userId;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(filter)
      .populate('orderId', 'status finalPrice')
      .populate('userId', 'name email')
      .populate('storeId', 'storeName')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(filter)
  ]);
  
  res.status(200).json({
    success: true,
    data: payments,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Admin: Get payment by ID
exports.getPaymentById = asyncHandler(async (req, res, next) => {
  const payment = await Payment.findById(req.params.id)
    .populate('orderId')
    .populate('userId', 'name email phone')
    .populate('storeId', 'storeName address');
  
  if (!payment) {
    return next(new AppError('Payment not found', 404));
  }
  
  res.status(200).json({
    success: true,
    data: payment
  });
});

