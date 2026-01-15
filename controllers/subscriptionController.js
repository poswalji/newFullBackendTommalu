const Subscription = require('../models/subscriptionSchema');
const catchAsync = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// 1. Submit Subscription Request (Public/User)
exports.createSubscription = catchAsync(async (req, res, next) => {
    const {
        planId,
        customerName,
        mobileNumber,
        deliveryAddress,
        startDate,
        quantity,
        rotiPreference
    } = req.body;

    // 1. Validate Plan
    const SubscriptionPlan = require('../models/subscriptionPlanSchema');
    const plan = await SubscriptionPlan.findById(planId);

    if (!plan) {
        return next(new AppError('Invalid Subscription Plan ID', 400));
    }

    // 2. Calculate End Date (Based on plan duration or defaulting to 30)
    const start = new Date(startDate);
    const end = new Date(start);
    // Use plan duration if available, else 30 days
    const duration = 30;
    end.setDate(start.getDate() + duration);

    const subscription = await Subscription.create({
        userId: req.user ? req.user._id : undefined,
        customerName,
        mobileNumber,
        deliveryAddress,

        // Link to Plan
        planId: plan._id,
        planName: plan.title,
        price: plan.price,
        planType: plan.planType,

        startDate: start,
        endDate: end,
        duration: duration,

        quantity,
        rotiPreference,
        status: 'pending' // Always start as pending
    });

    res.status(201).json({
        success: true,
        message: 'Subscription request submitted successfully',
        data: subscription
    });
});

// 2. Get All Subscriptions (Admin)
exports.getAllSubscriptions = catchAsync(async (req, res, next) => {
    const { status, page = 1, limit = 20 } = req.query;

    const query = {};
    if (status && status !== 'all') query.status = status;

    const subscriptions = await Subscription.find(query)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit * 1);

    const total = await Subscription.countDocuments(query);

    res.status(200).json({
        success: true,
        data: subscriptions,
        pagination: {
            total,
            page: Number(page),
            pages: Math.ceil(total / limit)
        }
    });
});

// 3. Update Subscription Status (Admin)
exports.updateSubscriptionStatus = catchAsync(async (req, res, next) => {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    const subscription = await Subscription.findByIdAndUpdate(
        id,
        { status, adminNotes },
        { new: true, runValidators: true }
    );

    if (!subscription) {
        return next(new AppError('Subscription not found', 404));
    }

    res.status(200).json({
        success: true,
        message: 'Subscription updated successfully',
        data: subscription
    });
});

// 4. Get Daily Delivery List (Admin/Kitchen)
exports.getDailyDeliveries = catchAsync(async (req, res, next) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    // Find active subscriptions relevant for today
    // Logic: startDate <= today && endDate >= today && status === 'active'
    const activeSubs = await Subscription.find({
        status: 'active',
        startDate: { $lte: today },
        endDate: { $gte: today }
    });

    res.status(200).json({
        success: true,
        count: activeSubs.length,
        data: activeSubs
    });
});

// 5. Get User's Own Subscriptions (Customer)
exports.getUserSubscriptions = catchAsync(async (req, res, next) => {
    // Determine userId from authenticated user or query param as fallback (for testing)
    const userId = req.user._id;

    if (!userId) {
        return next(new AppError('User authentication required', 401));
    }

    const subscriptions = await Subscription.find({ userId })
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        count: subscriptions.length,
        data: subscriptions
    });
});
