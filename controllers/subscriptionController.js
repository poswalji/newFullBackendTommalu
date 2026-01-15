const Subscription = require('../models/subscriptionSchema');
const catchAsync = require('../utils/asyncHandler');
const AppError = require('../utils/appError');

// 1. Submit Subscription Request (Public/User)
exports.createSubscription = catchAsync(async (req, res, next) => {
    const {
        customerName,
        mobileNumber,
        deliveryAddress,
        planType,
        startDate,
        quantity,
        rotiPreference
    } = req.body;

    // Calculate End Date (Fixed 30 days for now)
    const start = new Date(startDate);
    const end = new Date(start);
    end.setDate(start.getDate() + 30);

    const subscription = await Subscription.create({
        userId: req.user ? req.user._id : undefined,
        customerName,
        mobileNumber,
        deliveryAddress,
        planType,
        startDate: start,
        endDate: end,
        quantity,
        rotiPreference,
        status: 'pending'
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
