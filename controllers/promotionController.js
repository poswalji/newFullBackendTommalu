const Promotion = require('../models/promotion');
const Order = require('../models/orderSchema');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ Admin: Create promotion
exports.createPromotion = asyncHandler(async (req, res, next) => {
  const {
    code,
    name,
    description,
    type,
    discountValue,
    maxDiscount,
    minOrderAmount,
    applicableTo,
    categories,
    storeIds,
    itemIds,
    targetUsers,
    cityFilter,
    maxUses,
    maxUsesPerUser,
    validFrom,
    validUntil
  } = req.body;
  
  // Check if code already exists
  const existingPromo = await Promotion.findOne({ code: code.toUpperCase() });
  if (existingPromo) {
    return next(new AppError('Promotion code already exists', 400));
  }
  
  const promotion = await Promotion.create({
    code: code.toUpperCase(),
    name,
    description,
    type,
    discountValue,
    maxDiscount,
    minOrderAmount: minOrderAmount || 0,
    applicableTo: applicableTo || 'all',
    categories: categories || [],
    storeIds: storeIds || [],
    itemIds: itemIds || [],
    targetUsers: targetUsers || 'all',
    cityFilter: cityFilter || [],
    maxUses,
    maxUsesPerUser: maxUsesPerUser || 1,
    validFrom: validFrom || new Date(),
    validUntil,
    createdBy: req.user._id
  });
  
  res.status(201).json({
    success: true,
    message: 'Promotion created successfully',
    data: promotion
  });
});

// ✅ Validate promotion code
exports.validatePromotion = asyncHandler(async (req, res, next) => {
  const { code, orderAmount, storeId } = req.body;
  const userId = req.user?._id || null;
  
  const result = await Promotion.findValidByCode(code, userId, orderAmount, storeId);
  
  if (!result.promotion) {
    return res.status(200).json({
      success: false,
      valid: false,
      reason: result.reason || 'Invalid promotion code'
    });
  }
  
  if (result.reason) {
    return res.status(200).json({
      success: false,
      valid: false,
      reason: result.reason
    });
  }
  
  // Calculate discount
  const discount = result.promotion.calculateDiscount(orderAmount);
  
  res.status(200).json({
    success: true,
    valid: true,
    data: {
      code: result.promotion.code,
      name: result.promotion.name,
      type: result.promotion.type,
      discountValue: result.promotion.discountValue,
      discount: discount,
      maxDiscount: result.promotion.maxDiscount,
      minOrderAmount: result.promotion.minOrderAmount
    }
  });
});

// ✅ Apply promotion to order
exports.applyPromotion = asyncHandler(async (req, res, next) => {
  const { code, orderId, orderAmount, storeId } = req.body;
  const userId = req.user._id;
  
  const result = await Promotion.findValidByCode(code, userId, orderAmount, storeId);
  
  if (!result.promotion || result.reason) {
    return next(new AppError(result.reason || 'Invalid promotion code', 400));
  }
  
  // Calculate discount
  const discount = result.promotion.calculateDiscount(orderAmount);
  
  // Apply promotion
  await result.promotion.apply(userId, orderId, orderAmount, discount);
  
  res.status(200).json({
    success: true,
    message: 'Promotion applied successfully',
    data: {
      code: result.promotion.code,
      discount,
      discountValue: result.promotion.discountValue,
      type: result.promotion.type
    }
  });
});

// ✅ Admin: Get all promotions
exports.getAllPromotions = asyncHandler(async (req, res, next) => {
  const { isActive, type, page = 1, limit = 20 } = req.query;
  
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (type) filter.type = type;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [promotions, total] = await Promise.all([
    Promotion.find(filter)
      .populate('createdBy', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Promotion.countDocuments(filter)
  ]);
  
  res.status(200).json({
    success: true,
    data: promotions,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Admin: Get promotion by ID
exports.getPromotionById = asyncHandler(async (req, res, next) => {
  const promotion = await Promotion.findById(req.params.id)
    .populate('createdBy', 'name email')
    .populate('storeIds', 'storeName')
    .populate('itemIds', 'name');
  
  if (!promotion) {
    return next(new AppError('Promotion not found', 404));
  }
  
  res.status(200).json({
    success: true,
    data: promotion
  });
});

// ✅ Admin: Update promotion
exports.updatePromotion = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const updates = req.body;
  
  // Don't allow updating code, usedCount
  delete updates.code;
  delete updates.usedCount;
  delete updates.usedBy;
  
  const promotion = await Promotion.findByIdAndUpdate(
    id,
    updates,
    { new: true, runValidators: true }
  );
  
  if (!promotion) {
    return next(new AppError('Promotion not found', 404));
  }
  
  res.status(200).json({
    success: true,
    message: 'Promotion updated successfully',
    data: promotion
  });
});

// ✅ Admin: Toggle promotion status
exports.togglePromotion = asyncHandler(async (req, res, next) => {
  const promotion = await Promotion.findById(req.params.id);
  
  if (!promotion) {
    return next(new AppError('Promotion not found', 404));
  }
  
  promotion.isActive = !promotion.isActive;
  await promotion.save();
  
  res.status(200).json({
    success: true,
    message: `Promotion ${promotion.isActive ? 'activated' : 'deactivated'} successfully`,
    data: promotion
  });
});

// ✅ Admin: Delete promotion
exports.deletePromotion = asyncHandler(async (req, res, next) => {
  const promotion = await Promotion.findById(req.params.id);
  
  if (!promotion) {
    return next(new AppError('Promotion not found', 404));
  }
  
  // Don't delete if already used
  if (promotion.usedCount > 0) {
    return next(new AppError('Cannot delete promotion that has been used', 400));
  }
  
  await Promotion.findByIdAndDelete(req.params.id);
  
  res.status(200).json({
    success: true,
    message: 'Promotion deleted successfully'
  });
});

// ✅ Get active promotions (public)
exports.getActivePromotions = asyncHandler(async (req, res, next) => {
  const { city, storeId } = req.query;
  
  const filter = {
    isActive: true,
    validFrom: { $lte: new Date() },
    validUntil: { $gte: new Date() }
  };
  
  if (city) {
    filter.$or = [
      { cityFilter: { $size: 0 } },
      { cityFilter: city }
    ];
  }
  
  if (storeId) {
    filter.$or = [
      { applicableTo: 'all' },
      { applicableTo: 'store', storeIds: storeId }
    ];
  }
  
  const promotions = await Promotion.find(filter)
    .select('code name description type discountValue maxDiscount minOrderAmount validUntil')
    .sort({ createdAt: -1 })
    .limit(20);
  
  res.status(200).json({
    success: true,
    data: promotions
  });
});

// ✅ Get promotion usage stats (admin)
exports.getPromotionStats = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  
  const promotion = await Promotion.findById(id)
    .populate('usedBy.userId', 'name email')
    .populate('usedBy.orderId', 'finalPrice');
  
  if (!promotion) {
    return next(new AppError('Promotion not found', 404));
  }
  
  const totalDiscount = promotion.usedBy.reduce(
    (sum, usage) => sum + (usage.discountApplied || 0),
    0
  );
  
  const uniqueUsers = new Set(
    promotion.usedBy.map(usage => usage.userId._id.toString())
  ).size;
  
  res.status(200).json({
    success: true,
    data: {
      promotion: {
        code: promotion.code,
        name: promotion.name,
        usedCount: promotion.usedCount,
        maxUses: promotion.maxUses,
        totalDiscount,
        uniqueUsers,
        usageRate: promotion.maxUses 
          ? ((promotion.usedCount / promotion.maxUses) * 100).toFixed(2)
          : null
      },
      usageHistory: promotion.usedBy
    }
  });
});

