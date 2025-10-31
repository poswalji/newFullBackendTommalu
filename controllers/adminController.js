const User = require('../models/user');
const Order = require('../models/orderSchema');
const Store = require('../models/store');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');
const bcrypt = require('bcryptjs');

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

  res.json({ success: true, items, total, page: Number(page), limit: Number(limit) });
});

// PATCH /api/admin/users/:id/suspend
exports.suspendUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'suspended' },
    { new: true }
  );
  if (!user) return next(new AppError('User not found', 404));
  res.json({ success: true, user });
});

// PATCH /api/admin/users/:id/reactivate
exports.reactivateUser = asyncHandler(async (req, res, next) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { status: 'active' },
    { new: true }
  );
  if (!user) return next(new AppError('User not found', 404));
  res.json({ success: true, user });
});

// POST /api/admin/users/:id/reset-password
exports.resetPassword = asyncHandler(async (req, res, next) => {
  const temp = Math.random().toString(36).slice(-10);
  const hashed = await bcrypt.hash(temp, 12);
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { password: hashed },
    { new: true }
  );
  if (!user) return next(new AppError('User not found', 404));
  res.json({ success: true, tempPassword: temp });
});

// GET /api/admin/users/:id/history/orders
exports.getUserOrders = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 20 } = req.query;
  const skip = (Number(page) - 1) * Number(limit);
  const filter = { userId: req.params.id };
  const [items, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Order.countDocuments(filter)
  ]);
  res.json({ success: true, items, total, page: Number(page), limit: Number(limit) });
});

// GET /api/admin/users/:id/history/transactions
exports.getUserTransactions = asyncHandler(async (req, res) => {
  // Placeholder until payments module exists
  res.json({ success: true, items: [], total: 0, page: 1, limit: 20 });
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
  res.json({ success: true, items, total, page: Number(page), limit: Number(limit) });
});

// POST /api/admin/stores/:id/approve
exports.approveStore = asyncHandler(async (req, res, next) => {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'active', isVerified: true, rejectionReason: undefined },
    { new: true }
  );
  if (!store) return next(new AppError('Store not found', 404));
  // TODO: notify store owner via email/SMS
  res.json({ success: true, store });
});

// POST /api/admin/stores/:id/reject
exports.rejectStore = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'rejected', isVerified: false, rejectionReason: reason || 'Not specified' },
    { new: true }
  );
  if (!store) return next(new AppError('Store not found', 404));
  // TODO: notify store owner via email/SMS
  res.json({ success: true, store });
});

// PATCH /api/admin/stores/:id/suspend
exports.suspendStore = asyncHandler(async (req, res, next) => {
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { status: 'suspended', available: false },
    { new: true }
  );
  if (!store) return next(new AppError('Store not found', 404));
  res.json({ success: true, store });
});

// PATCH /api/admin/stores/:id/metadata
exports.updateStoreMetadata = asyncHandler(async (req, res, next) => {
  const allowed = ['category', 'description', 'openingTime', 'closingTime', 'deliveryFee', 'minOrder'];
  const updates = {};
  allowed.forEach((k) => {
    if (req.body[k] !== undefined) updates[k] = req.body[k];
  });
  const store = await Store.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
  if (!store) return next(new AppError('Store not found', 404));
  res.json({ success: true, store });
});

// PATCH /api/admin/stores/:id/commission
exports.updateStoreCommission = asyncHandler(async (req, res, next) => {
  const { commissionRate } = req.body;
  if (commissionRate === undefined) return next(new AppError('commissionRate is required', 400));
  const store = await Store.findByIdAndUpdate(
    req.params.id,
    { commissionRate },
    { new: true, runValidators: true }
  );
  if (!store) return next(new AppError('Store not found', 404));
  res.json({ success: true, store });
});


