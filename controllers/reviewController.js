const Review = require('../models/review');
const Order = require('../models/orderSchema');
const Store = require('../models/store');
const MenuItem = require('../models/menuItems');
const asyncHandler = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// ✅ Create review (customer only)
exports.createReview = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { orderId, storeRating, storeComment, itemRatings, deliveryRating, deliveryComment } = req.body;
  
  if (req.user.role !== 'customer') {
    return next(new AppError('Only customers can create reviews', 403));
  }
  
  // Check if order exists and belongs to user
  const order = await Order.findById(orderId)
    .populate('storeId')
    .populate('items.menuItemId');
  
  if (!order) {
    return next(new AppError('Order not found', 404));
  }
  
  if (order.userId.toString() !== userId.toString()) {
    return next(new AppError('Order does not belong to you', 403));
  }
  
  // Check if order is delivered
  if (order.status !== 'Delivered') {
    return next(new AppError('Can only review delivered orders', 400));
  }
  
  // Check if review already exists
  const existingReview = await Review.findOne({ orderId });
  if (existingReview) {
    return next(new AppError('Review already exists for this order', 400));
  }
  
  // Validate store rating
  if (!storeRating || storeRating < 1 || storeRating > 5) {
    return next(new AppError('Store rating must be between 1 and 5', 400));
  }
  
  // Create review
  const review = await Review.create({
    orderId,
    userId,
    storeId: order.storeId._id || order.storeId,
    storeRating,
    storeComment: storeComment || undefined,
    itemRatings: itemRatings || [],
    deliveryRating: deliveryRating || undefined,
    deliveryComment: deliveryComment || undefined
  });
  
  // Update store rating
  await updateStoreRating(order.storeId._id || order.storeId);
  
  // Update menu item ratings if provided
  if (itemRatings && itemRatings.length > 0) {
    for (const itemRating of itemRatings) {
      await updateMenuItemRating(itemRating.menuItemId, itemRating.rating);
    }
  }
  
  res.status(201).json({
    success: true,
    message: 'Review created successfully',
    data: review
  });
});

// ✅ Update review (within 24 hours)
exports.updateReview = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { storeRating, storeComment, itemRatings, deliveryRating, deliveryComment } = req.body;
  
  const review = await Review.findById(id);
  
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  if (review.userId.toString() !== userId.toString()) {
    return next(new AppError('Not authorized to update this review', 403));
  }
  
  if (!review.isEditable()) {
    return next(new AppError('Review can only be edited within 24 hours', 400));
  }
  
  // Update review
  if (storeRating) review.storeRating = storeRating;
  if (storeComment !== undefined) review.storeComment = storeComment;
  if (itemRatings) review.itemRatings = itemRatings;
  if (deliveryRating) review.deliveryRating = deliveryRating;
  if (deliveryComment !== undefined) review.deliveryComment = deliveryComment;
  
  await review.save();
  
  // Update store rating
  await updateStoreRating(review.storeId);
  
  res.status(200).json({
    success: true,
    message: 'Review updated successfully',
    data: review
  });
});

// ✅ Get reviews for store
exports.getStoreReviews = asyncHandler(async (req, res, next) => {
  const { storeId } = req.params;
  const { status = 'active', page = 1, limit = 20, sortBy = 'newest' } = req.query;
  
  const filter = { storeId, status };
  const sortOptions = {};
  
  if (sortBy === 'newest') sortOptions.createdAt = -1;
  else if (sortBy === 'oldest') sortOptions.createdAt = 1;
  else if (sortBy === 'highest') sortOptions.storeRating = -1;
  else if (sortBy === 'lowest') sortOptions.storeRating = 1;
  else if (sortBy === 'helpful') sortOptions.helpfulCount = -1;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('userId', 'name')
      .populate('storeResponse.respondedBy', 'name')
      .sort(sortOptions)
      .skip(skip)
      .limit(Number(limit)),
    Review.countDocuments(filter)
  ]);
  
  res.status(200).json({
    success: true,
    data: reviews,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Get user reviews
exports.getUserReviews = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { page = 1, limit = 20 } = req.query;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [reviews, total] = await Promise.all([
    Review.find({ userId })
      .populate('storeId', 'storeName')
      .populate('orderId', 'status finalPrice')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Review.countDocuments({ userId })
  ]);
  
  res.status(200).json({
    success: true,
    data: reviews,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Store owner response to review
exports.addStoreResponse = asyncHandler(async (req, res, next) => {
  const ownerId = req.user._id;
  const { id } = req.params;
  const { response } = req.body;
  
  if (req.user.role !== 'storeOwner') {
    return next(new AppError('Only store owners can respond to reviews', 403));
  }
  
  const review = await Review.findById(id).populate('storeId');
  
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  // Verify store ownership
  if (review.storeId.ownerId.toString() !== ownerId.toString()) {
    return next(new AppError('Not authorized to respond to this review', 403));
  }
  
  // Add response
  await review.addStoreResponse(ownerId, response);
  
  res.status(200).json({
    success: true,
    message: 'Response added successfully',
    data: review
  });
});

// ✅ Report review
exports.reportReview = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { id } = req.params;
  const { reason } = req.body;
  
  const validReasons = ['spam', 'fake', 'inappropriate', 'other'];
  if (!validReasons.includes(reason)) {
    return next(new AppError('Invalid report reason', 400));
  }
  
  const review = await Review.findById(id);
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  await review.report(userId, reason);
  
  res.status(200).json({
    success: true,
    message: 'Review reported successfully'
  });
});

// ✅ Mark review as helpful
exports.markHelpful = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const { id } = req.params;
  
  const review = await Review.findById(id);
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  await review.markHelpful(userId);
  
  res.status(200).json({
    success: true,
    message: 'Review marked as helpful',
    data: review
  });
});

// ✅ Admin: Get all reviews
exports.getAllReviews = asyncHandler(async (req, res, next) => {
  const { status, storeId, userId, page = 1, limit = 20 } = req.query;
  
  const filter = {};
  if (status) filter.status = status;
  if (storeId) filter.storeId = storeId;
  if (userId) filter.userId = userId;
  
  const skip = (Number(page) - 1) * Number(limit);
  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('userId', 'name email')
      .populate('storeId', 'storeName')
      .populate('orderId', 'status')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    Review.countDocuments(filter)
  ]);
  
  res.status(200).json({
    success: true,
    data: reviews,
    total,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / Number(limit))
    }
  });
});

// ✅ Admin: Moderate review
exports.moderateReview = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, moderationNotes } = req.body;
  
  const validStatuses = ['active', 'reported', 'hidden', 'deleted'];
  if (!validStatuses.includes(status)) {
    return next(new AppError('Invalid status', 400));
  }
  
  const review = await Review.findByIdAndUpdate(
    id,
    {
      status,
      moderationNotes,
      moderatedBy: req.user._id
    },
    { new: true }
  );
  
  if (!review) {
    return next(new AppError('Review not found', 404));
  }
  
  // Update store rating if review was deleted/hidden
  if (status === 'deleted' || status === 'hidden') {
    await updateStoreRating(review.storeId);
  }
  
  res.status(200).json({
    success: true,
    message: 'Review moderated successfully',
    data: review
  });
});

// Helper function to update store rating
async function updateStoreRating(storeId) {
  const ratingData = await Review.getAverageRating(storeId);
  await Store.findByIdAndUpdate(storeId, {
    rating: ratingData.averageRating,
    totalReviews: ratingData.totalReviews
  });
}

// Helper function to update menu item rating (if needed)
async function updateMenuItemRating(menuItemId, rating) {
  // This could be enhanced to calculate average rating for items
  const item = await MenuItem.findById(menuItemId);
  if (item) {
    // Could add rating tracking to menu items
  }
}

// All functions are already exported using exports.functionName above
// No need for module.exports as it conflicts with the exports pattern

