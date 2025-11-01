const Payout = require('../models/payout');
const Payment = require('../models/payment');
const Store = require('../models/store');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ Get payouts for store owner
exports.getMyPayouts = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const { status, page = 1, limit = 20 } = req.query;
  
  // Get all stores owned by user
  const stores = await Store.find({ ownerId });
  const storeIds = stores.map(s => s._id);
  
  const filter = { ownerId, storeId: { $in: storeIds } };
  if (status) filter.status = status;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [payouts, total] = await Promise.all([
    Payout.find(filter)
      .populate('storeId', 'storeName')
      .populate('processedBy', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payout.countDocuments(filter)
  ]);
  
  // Calculate totals
  const totalEarnings = payouts
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.netPayoutAmount, 0);
  
  const pendingPayouts = payouts
    .filter(p => ['pending', 'approved', 'processing'].includes(p.status))
    .reduce((sum, p) => sum + p.netPayoutAmount, 0);
  
  res.status(200).json({
    success: true,
    data: payouts,
    summary: {
      totalEarnings,
      pendingPayouts,
      completedCount: payouts.filter(p => p.status === 'completed').length
    },
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Get payout details
exports.getPayoutById = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const payout = await Payout.findById(req.params.id)
    .populate('storeId', 'storeName')
    .populate('ownerId', 'name email phone')
    .populate('processedBy', 'name email')
    .populate('paymentIds');
  
  if (!payout) {
    return next(new AppError('Payout not found', 404));
  }
  
  // Verify ownership
  if (payout.ownerId._id.toString() !== ownerId.toString()) {
    return next(new AppError('Not authorized to view this payout', 403));
  }
  
  res.status(200).json({
    success: true,
    data: payout
  });
});

// ✅ Request early payout (manual admin approval)
exports.requestEarlyPayout = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const { storeId, notes } = req.body;
  
  // Verify store ownership
  const store = await Store.findOne({ _id: storeId, ownerId });
  if (!store) {
    return next(new AppError('Store not found or unauthorized', 404));
  }
  
  // Get eligible payments
  const eligiblePayments = await Payment.find({
    storeId,
    status: 'completed',
    payoutStatus: 'eligible'
  });
  
  if (eligiblePayments.length === 0) {
    return next(new AppError('No eligible payments for payout', 400));
  }
  
  // Calculate period (last 7 days or from last payout)
  const lastPayout = await Payout.findOne({ storeId })
    .sort({ periodEnd: -1 });
  
  const periodStart = lastPayout 
    ? new Date(lastPayout.periodEnd)
    : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const periodEnd = new Date();
  
  // Create payout request
  const payout = await Payout.create({
    storeId,
    ownerId,
    periodStart,
    periodEnd,
    status: 'pending',
    notes: notes || 'Early payout request'
  });
  
  payout.calculateTotals(eligiblePayments);
  await payout.save();
  
  // TODO: Notify admin about early payout request
  
  res.status(201).json({
    success: true,
    message: 'Early payout request submitted. Waiting for admin approval.',
    data: payout
  });
});

// ✅ Get earnings statement
exports.getEarningsStatement = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const { storeId, startDate, endDate, page = 1, limit = 50 } = req.query;
  
  // Get stores owned by user
  const stores = await Store.find({ ownerId });
  const storeIds = stores.map(s => s._id);
  
  if (storeId && !storeIds.includes(storeId)) {
    return next(new AppError('Store not found or unauthorized', 404));
  }
  
  const paymentFilter = { 
    storeId: storeId ? storeId : { $in: storeIds },
    status: 'completed'
  };
  
  if (startDate || endDate) {
    paymentFilter.createdAt = {};
    if (startDate) paymentFilter.createdAt.$gte = new Date(startDate);
    if (endDate) paymentFilter.createdAt.$lte = new Date(endDate);
  }
  
  const skip = (Number(page) - 1) * Number(limit);
  const [payments, total] = await Promise.all([
    Payment.find(paymentFilter)
      .populate('orderId', 'status finalPrice')
      .populate('storeId', 'storeName')
      .populate('userId', 'name')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Payment.countDocuments(paymentFilter)
  ]);
  
  // Calculate summary
  const summary = payments.reduce((acc, payment) => {
    acc.totalRevenue += payment.amount;
    acc.totalCommission += payment.commissionAmount;
    acc.totalPayout += payment.storePayoutAmount;
    acc.orderCount += 1;
    return acc;
  }, { totalRevenue: 0, totalCommission: 0, totalPayout: 0, orderCount: 0 });
  
  res.status(200).json({
    success: true,
    data: payments,
    summary,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Download statement (PDF-ready format)
exports.downloadStatement = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const { storeId, startDate, endDate } = req.query;
  
  // Get stores owned by user
  const stores = await Store.find({ ownerId });
  const storeIds = stores.map(s => s._id);
  
  if (storeId && !storeIds.includes(storeId)) {
    return next(new AppError('Store not found or unauthorized', 404));
  }
  
  const paymentFilter = { 
    storeId: storeId ? storeId : { $in: storeIds },
    status: 'completed'
  };
  
  if (startDate || endDate) {
    paymentFilter.createdAt = {};
    if (startDate) paymentFilter.createdAt.$gte = new Date(startDate);
    if (endDate) paymentFilter.createdAt.$lte = new Date(endDate);
  }
  
  const payments = await Payment.find(paymentFilter)
    .populate('orderId', 'status finalPrice createdAt')
    .populate('storeId', 'storeName')
    .populate('userId', 'name email')
    .sort({ createdAt: -1 });
  
  // Calculate totals
  const totals = payments.reduce((acc, payment) => {
    acc.totalRevenue += payment.amount;
    acc.totalCommission += payment.commissionAmount;
    acc.totalPayout += payment.storePayoutAmount;
    acc.orderCount += 1;
    return acc;
  }, { totalRevenue: 0, totalCommission: 0, totalPayout: 0, orderCount: 0 });
  
  // TODO: Generate PDF using library like pdfkit or puppeteer
  res.status(200).json({
    success: true,
    message: 'Statement data ready for PDF generation',
    data: {
      payments: payments.map(p => ({
        orderId: p.orderId?._id,
        orderDate: p.orderId?.createdAt,
        customerName: p.userId?.name,
        storeName: p.storeId?.storeName,
        amount: p.amount,
        commission: p.commissionAmount,
        payout: p.storePayoutAmount,
        status: p.status,
        payoutStatus: p.payoutStatus
      })),
      totals,
      period: {
        start: startDate || 'Beginning',
        end: endDate || 'Now'
      }
    }
  });
});

