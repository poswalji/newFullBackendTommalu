const { HomemadeFood, HomemadeFoodOrder } = require("../models/homemadeFood");
const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/appError");
const { sendHomemadeFoodOrderNotification, sendHomemadeFoodOrderStatusUpdate } = require("../utils/emailService");
const { emitToAdmin } = require("../utils/firebase");

// ============================================
// PUBLIC ENDPOINTS
// ============================================

/**
 * Get today's special - the active homemade food item marked as today's special
 * @route GET /api/public/homemade-food/todays-special
 */
exports.getTodaysSpecial = asyncHandler(async (req, res) => {
  const todaysSpecial = await HomemadeFood.findOne({
    isActive: true,
    isTodaysSpecial: true
  });

  if (!todaysSpecial) {
    return res.status(200).json({
      success: true,
      data: null,
      message: "No today's special available"
    });
  }

  res.status(200).json({
    success: true,
    data: todaysSpecial
  });
});

/**
 * Get all active homemade food items
 * @route GET /api/public/homemade-food
 */
exports.getActiveHomemadeFoods = asyncHandler(async (req, res) => {
  const foods = await HomemadeFood.find({ isActive: true })
    .sort({ isTodaysSpecial: -1, createdAt: -1 });

  res.status(200).json({
    success: true,
    data: foods,
    total: foods.length
  });
});

/**
 * Submit a homemade food order (public - no auth required)
 * @route POST /api/public/homemade-food/order
 */
exports.submitOrder = asyncHandler(async (req, res) => {
  const {
    customerName,
    mobileNumber,
    email,
    street,
    landmark,
    city,
    state,
    pincode,
    foodItemId,
    quantity,
    specialInstructions,
    preferredDeliverySlot,
    paymentMethod
  } = req.body;

  // Validate required fields
  if (!customerName || !mobileNumber || !street || !city || !pincode || !foodItemId || !quantity) {
    throw new AppError("Please provide all required fields", 400);
  }

  // Validate quantity
  if (quantity < 1 || quantity > 50) {
    throw new AppError("Quantity must be between 1 and 50", 400);
  }

  // Get the food item
  const foodItem = await HomemadeFood.findById(foodItemId);
  if (!foodItem) {
    throw new AppError("Food item not found", 404);
  }
  if (!foodItem.isActive) {
    throw new AppError("This item is currently not available", 400);
  }

  // Check quantity availability
  if (foodItem.availableQuantity !== -1 && foodItem.availableQuantity < quantity) {
    throw new AppError(`Only ${foodItem.availableQuantity} items available`, 400);
  }

  // Calculate amounts
  const pricePerUnit = foodItem.price;
  const totalAmount = quantity * pricePerUnit;
  const deliveryCharge = 30; // Fixed delivery charge, can be made configurable
  const finalAmount = totalAmount + deliveryCharge;

  // Create order
  const order = await HomemadeFoodOrder.create({
    customerName,
    mobileNumber,
    email,
    userId: req.user?._id || null,
    deliveryAddress: {
      street,
      landmark,
      city,
      state,
      pincode
    },
    foodItem: foodItem._id,
    foodName: foodItem.name,
    quantity,
    pricePerUnit,
    totalAmount,
    deliveryCharge,
    finalAmount,
    specialInstructions,
    preferredDeliverySlot: preferredDeliverySlot || 'any',
    paymentMethod: paymentMethod || 'cash_on_delivery',
    status: 'pending',
    paymentStatus: paymentMethod === 'cash_on_delivery' ? 'pending' : 'pending'
  });

  // Update available quantity if not unlimited
  if (foodItem.availableQuantity !== -1) {
    foodItem.availableQuantity -= quantity;
    await foodItem.save();
  }

  // Send notification to admin via email and Firebase
  try {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.EMAIL_USER;
    if (adminEmail) {
      await sendHomemadeFoodOrderNotification(adminEmail, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        mobileNumber: order.mobileNumber,
        foodName: order.foodName,
        quantity: order.quantity,
        finalAmount: order.finalAmount,
        deliveryAddress: order.deliveryAddress,
        specialInstructions: order.specialInstructions
      });
    }
  } catch (emailError) {
    console.error("Failed to send admin notification email:", emailError);
  }

  // Send Firebase notification to admin
  try {
    emitToAdmin('new_homemade_food_order', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      foodName: order.foodName,
      quantity: order.quantity,
      finalAmount: order.finalAmount,
      createdAt: order.createdAt
    });
  } catch (firebaseError) {
    console.error("Failed to send Firebase notification:", firebaseError);
  }

  res.status(201).json({
    success: true,
    data: order,
    message: "Order placed successfully! We will contact you shortly."
  });
});

/**
 * Track order by order number and mobile
 * @route GET /api/public/homemade-food/order/track
 */
exports.trackOrder = asyncHandler(async (req, res) => {
  const { orderNumber, mobileNumber } = req.query;

  if (!orderNumber || !mobileNumber) {
    throw new AppError("Please provide order number and mobile number", 400);
  }

  const order = await HomemadeFoodOrder.findOne({
    orderNumber: orderNumber.toUpperCase(),
    mobileNumber
  }).select('-adminNotes');

  if (!order) {
    throw new AppError("Order not found. Please check your order number and mobile number.", 404);
  }

  res.status(200).json({
    success: true,
    data: order
  });
});

// ============================================
// ADMIN ENDPOINTS
// ============================================

/**
 * Get all homemade food items (admin)
 * @route GET /api/admin/homemade-food
 */
exports.getAllHomemadeFoods = asyncHandler(async (req, res) => {
  const { isActive, isTodaysSpecial } = req.query;
  
  const filter = {};
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (isTodaysSpecial !== undefined) filter.isTodaysSpecial = isTodaysSpecial === 'true';

  const foods = await HomemadeFood.find(filter).sort({ createdAt: -1 });

  res.status(200).json({
    success: true,
    data: foods,
    total: foods.length
  });
});

/**
 * Create a new homemade food item
 * @route POST /api/admin/homemade-food
 */
exports.createHomemadeFood = asyncHandler(async (req, res) => {
  const {
    name,
    description,
    image,
    price,
    features,
    isActive,
    isTodaysSpecial,
    availableQuantity,
    servingSize,
    preparationTime,
    cuisine,
    tags,
    nutritionInfo
  } = req.body;

  // If setting as today's special, unset others
  if (isTodaysSpecial) {
    await HomemadeFood.updateMany({}, { isTodaysSpecial: false });
  }

  const food = await HomemadeFood.create({
    name,
    description,
    image,
    price,
    features: features || [],
    isActive: isActive !== undefined ? isActive : true,
    isTodaysSpecial: isTodaysSpecial || false,
    availableQuantity: availableQuantity !== undefined ? availableQuantity : -1,
    servingSize,
    preparationTime,
    cuisine,
    tags: tags || [],
    nutritionInfo
  });

  res.status(201).json({
    success: true,
    data: food,
    message: "Homemade food item created successfully"
  });
});

/**
 * Update a homemade food item
 * @route PUT /api/admin/homemade-food/:id
 */
exports.updateHomemadeFood = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updates = req.body;

  // If setting as today's special, unset others
  if (updates.isTodaysSpecial === true) {
    await HomemadeFood.updateMany({ _id: { $ne: id } }, { isTodaysSpecial: false });
  }

  const food = await HomemadeFood.findByIdAndUpdate(
    id,
    updates,
    { new: true, runValidators: true }
  );

  if (!food) {
    throw new AppError("Food item not found", 404);
  }

  res.status(200).json({
    success: true,
    data: food,
    message: "Food item updated successfully"
  });
});

/**
 * Delete a homemade food item
 * @route DELETE /api/admin/homemade-food/:id
 */
exports.deleteHomemadeFood = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const food = await HomemadeFood.findByIdAndDelete(id);

  if (!food) {
    throw new AppError("Food item not found", 404);
  }

  res.status(200).json({
    success: true,
    message: "Food item deleted successfully"
  });
});

/**
 * Set today's special
 * @route PATCH /api/admin/homemade-food/:id/set-todays-special
 */
exports.setTodaysSpecial = asyncHandler(async (req, res) => {
  const { id } = req.params;

  // Unset all other today's special
  await HomemadeFood.updateMany({}, { isTodaysSpecial: false });

  // Set this one as today's special
  const food = await HomemadeFood.findByIdAndUpdate(
    id,
    { isTodaysSpecial: true, isActive: true },
    { new: true }
  );

  if (!food) {
    throw new AppError("Food item not found", 404);
  }

  res.status(200).json({
    success: true,
    data: food,
    message: "Today's special updated successfully"
  });
});

/**
 * Get all homemade food orders (admin)
 * @route GET /api/admin/homemade-food/orders
 */
exports.getAllOrders = asyncHandler(async (req, res) => {
  const { status, page = 1, limit = 20, startDate, endDate, search } = req.query;
  
  const filter = {};
  
  if (status && status !== 'all') {
    filter.status = status;
  }
  
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  
  if (search) {
    filter.$or = [
      { customerName: { $regex: search, $options: 'i' } },
      { mobileNumber: { $regex: search, $options: 'i' } },
      { orderNumber: { $regex: search, $options: 'i' } }
    ];
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const [orders, total] = await Promise.all([
    HomemadeFoodOrder.find(filter)
      .populate('foodItem', 'name image price')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    HomemadeFoodOrder.countDocuments(filter)
  ]);

  res.status(200).json({
    success: true,
    data: orders,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

/**
 * Get single order details (admin)
 * @route GET /api/admin/homemade-food/orders/:id
 */
exports.getOrderById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await HomemadeFoodOrder.findById(id)
    .populate('foodItem', 'name image price description features')
    .populate('userId', 'name email phone');

  if (!order) {
    throw new AppError("Order not found", 404);
  }

  res.status(200).json({
    success: true,
    data: order
  });
});

/**
 * Update order status (admin)
 * @route PATCH /api/admin/homemade-food/orders/:id/status
 */
exports.updateOrderStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, adminNotes, cancellationReason, refundDetails, estimatedDeliveryTime } = req.body;

  const validStatuses = [
    'pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery',
    'delivered', 'cancelled', 'refund_initiated', 'refund_completed',
    'payment_pending', 'payment_received', 'payment_failed'
  ];

  if (!validStatuses.includes(status)) {
    throw new AppError("Invalid status", 400);
  }

  const order = await HomemadeFoodOrder.findById(id);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  // Update fields
  order.status = status;
  if (adminNotes) order.adminNotes = adminNotes;
  if (cancellationReason && status === 'cancelled') order.cancellationReason = cancellationReason;
  if (refundDetails && ['refund_initiated', 'refund_completed'].includes(status)) {
    order.refundDetails = refundDetails;
  }
  if (estimatedDeliveryTime) order.estimatedDeliveryTime = new Date(estimatedDeliveryTime);
  if (status === 'delivered') order.actualDeliveryTime = new Date();
  if (status === 'payment_received') order.paymentStatus = 'received';
  if (status === 'refund_completed') order.paymentStatus = 'refunded';

  await order.save();

  // Send email notification to customer about status update
  if (order.email) {
    try {
      await sendHomemadeFoodOrderStatusUpdate(order.email, {
        orderNumber: order.orderNumber,
        customerName: order.customerName,
        foodName: order.foodName,
        status: order.status,
        finalAmount: order.finalAmount
      });
    } catch (emailError) {
      console.error("Failed to send status update email:", emailError);
    }
  }

  res.status(200).json({
    success: true,
    data: order,
    message: "Order status updated successfully"
  });
});

/**
 * Update payment status (admin)
 * @route PATCH /api/admin/homemade-food/orders/:id/payment
 */
exports.updatePaymentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { paymentStatus, paymentId } = req.body;

  const validPaymentStatuses = ['pending', 'received', 'failed', 'refunded'];
  if (!validPaymentStatuses.includes(paymentStatus)) {
    throw new AppError("Invalid payment status", 400);
  }

  const order = await HomemadeFoodOrder.findById(id);
  if (!order) {
    throw new AppError("Order not found", 404);
  }

  order.paymentStatus = paymentStatus;
  if (paymentId) order.paymentId = paymentId;
  
  // Update order status based on payment
  if (paymentStatus === 'received' && order.status === 'payment_pending') {
    order.status = 'payment_received';
  }

  await order.save();

  res.status(200).json({
    success: true,
    data: order,
    message: "Payment status updated successfully"
  });
});

/**
 * Get homemade food analytics/revenue (admin)
 * @route GET /api/admin/homemade-food/analytics
 */
exports.getAnalytics = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const dateFilter = {};
  if (startDate) dateFilter.$gte = new Date(startDate);
  if (endDate) dateFilter.$lte = new Date(endDate);

  const matchStage = Object.keys(dateFilter).length > 0 
    ? { createdAt: dateFilter } 
    : {};

  // Get order statistics
  const orderStats = await HomemadeFoodOrder.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        totalOrders: { $sum: 1 },
        totalRevenue: { $sum: '$finalAmount' },
        avgOrderValue: { $avg: '$finalAmount' },
        totalDelivered: {
          $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] }
        },
        totalCancelled: {
          $sum: { $cond: [{ $eq: ['$status', 'cancelled'] }, 1, 0] }
        },
        totalPending: {
          $sum: { $cond: [{ $in: ['$status', ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']] }, 1, 0] }
        },
        totalQuantitySold: { $sum: '$quantity' }
      }
    }
  ]);

  // Get status breakdown
  const statusBreakdown = await HomemadeFoodOrder.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        revenue: { $sum: '$finalAmount' }
      }
    }
  ]);

  // Get daily revenue for chart
  const dailyRevenue = await HomemadeFoodOrder.aggregate([
    { $match: { ...matchStage, status: 'delivered' } },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        revenue: { $sum: '$finalAmount' },
        orders: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } },
    { $limit: 30 }
  ]);

  // Popular food items
  const popularItems = await HomemadeFoodOrder.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: '$foodItem',
        totalOrders: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
        totalRevenue: { $sum: '$finalAmount' },
        foodName: { $first: '$foodName' }
      }
    },
    { $sort: { totalOrders: -1 } },
    { $limit: 10 }
  ]);

  res.status(200).json({
    success: true,
    data: {
      summary: orderStats[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        avgOrderValue: 0,
        totalDelivered: 0,
        totalCancelled: 0,
        totalPending: 0,
        totalQuantitySold: 0
      },
      statusBreakdown,
      dailyRevenue,
      popularItems
    }
  });
});

/**
 * Export orders report (admin)
 * @route GET /api/admin/homemade-food/orders/export
 */
exports.exportOrders = asyncHandler(async (req, res) => {
  const { startDate, endDate, status, format = 'json' } = req.query;

  const filter = {};
  if (status && status !== 'all') filter.status = status;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }

  const orders = await HomemadeFoodOrder.find(filter)
    .populate('foodItem', 'name price')
    .sort({ createdAt: -1 });

  if (format === 'csv') {
    // Generate CSV
    const csv = orders.map(order => ({
      orderNumber: order.orderNumber,
      customerName: order.customerName,
      mobileNumber: order.mobileNumber,
      email: order.email || '',
      foodName: order.foodName,
      quantity: order.quantity,
      finalAmount: order.finalAmount,
      status: order.status,
      paymentStatus: order.paymentStatus,
      paymentMethod: order.paymentMethod,
      address: `${order.deliveryAddress.street}, ${order.deliveryAddress.city} - ${order.deliveryAddress.pincode}`,
      createdAt: order.createdAt.toISOString()
    }));

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=homemade-food-orders.csv');
    
    const headers = Object.keys(csv[0] || {}).join(',');
    const rows = csv.map(row => Object.values(row).join(',')).join('\n');
    return res.send(`${headers}\n${rows}`);
  }

  res.status(200).json({
    success: true,
    data: orders,
    total: orders.length
  });
});
